const doButton = document.getElementById('do') as HTMLButtonElement;
doButton.addEventListener('click', () => {
  var source = (document.getElementById('source') as HTMLTextAreaElement).value;

  var namespaceMatch = /namespace\s(.*)\s/mg.exec(source);
  var classMatch = /public partial class\s(\S*)\s/mg.exec(source);
  var fields: {
    dataType: string;
    name: string;
    camelCaseName: string;
  }[] = [];
  var fieldRegex = /public (\S*) (\S*) {\s*get;\s*\s/mg;
  var match: any;
  while(match = fieldRegex.exec(source)) {
    fields.push({
      dataType: match[1],
      name: match[2],
      camelCaseName: camelCase(match[2])
    });
  }

  interface TypeTemplate {
    readCode(propName:string) : string;
    writeCode(propName:string) : string;
  }

  let createEnumTemplate = (enumType: string): TypeTemplate => {
    return {
      readCode: (propName: string) => 
        `${propName} = (${enumType})Enum.Parse(typeof(${enumType}), reader.ReadSafeAsString());`,
      writeCode: (propName: string) => 
        `writer.Write(nameof(${propName}), ${propName}.ToString());`
    }
  }

  let createDefinitionTemplate = (definitionType: string): TypeTemplate => {
    return {
      readCode: (propName: string) => 
        `${propName} = ${definitionType}.Deserialize(reader);`,
      writeCode: (propName: string) => 
        `writer.Write(nameof(${propName}), ${propName});`
    }
  }

  let createDefinitionCollectionTemplate = (definitionType: string): TypeTemplate => {
    let type = /\<(.*)\>/.exec(definitionType)[1];
    return {
      readCode: (propName: string) => 
        `${propName} = JsonUtility.ParseArray(reader, ${type}.Deserialize);`,
      writeCode: (propName: string) => 
        `writer.WriteArray(nameof(${propName}), ${propName});`
    }
  }

  const primitiveTemplates: {[dataType:string]: TypeTemplate} = {
    'string': {
      readCode: (propName: string) => `${propName} = reader.ReadSafeAsString();`,
      writeCode: (propName: string) => `writer.Write(nameof(${propName}), ${propName});`
    },
    'bool': {
      readCode: (propName: string) => `${propName} = reader.ReadSafeAsBoolean();`,
      writeCode: (propName: string) => `writer.Write(nameof(${propName}), ${propName});`
    },
    'Guid': {
      readCode: (propName: string) => `${propName} = reader.ReadSafeAsGuid();`,
      writeCode: (propName: string) => `writer.Write(nameof(${propName}), ${propName});`
    },
    'IReadOnlyCollection<string>': {
      readCode: (propName: string) => `${propName} = JsonUtility.ParseArray(reader, r => r.ReadSafeAsString());`,
      writeCode: (propName: string) => `writer.WriteArray(nameof(${propName}), ${propName}, (w, s) => w.WriteValue(s));`
    }
  };

  let getTemplate = (dataType: string): TypeTemplate => {
    let result = primitiveTemplates[dataType];
    if (result) {
      return result;
    }
    if (dataType.endsWith('Definition')) {
      return createDefinitionTemplate(dataType);
    }
    if (dataType.endsWith('Definition>')) {
      return createDefinitionCollectionTemplate(dataType);
    }
    return createEnumTemplate(dataType);
  }

  let result = `
using System;
using System.Collections.Generic;
using Afas.Core.Json;
using Newtonsoft.Json;

namespace ${namespaceMatch[1]}
{
  public partial class ${classMatch[1]} : IJsonSerializable
  {
    public ${classMatch[1]}()
    {
    }

    public ${classMatch[1]}(
      ${fields.map(f => `${f.dataType} ${f.camelCaseName}`).join(',\n      ')})
    {
      ${fields.map(f => `${f.name} = ${f.camelCaseName};`).join('\n      ')}
    }

    public static ${classMatch[1]} Deserialize(JsonReader jsonReader)
    {
      var definition = new ${classMatch[1]}();
      definition.InitializeFromJson(jsonReader);
      return definition;
    }

    public void InitializeFromJson(JsonReader jsonReader)
    {
      JsonUtility.ReadFromJson(jsonReader, ReadProperty);
    }

    public void WriteToJson(JsonWriter jsonWriter)
    {
      jsonWriter.WriteObject(WriteProperties);
    }

    public void WriteProperties(JsonWriter writer)
    {
      ${fields.map(f => getTemplate(f.dataType).writeCode(f.name)).join('\n      ')}
    }

    public bool ReadProperty(JsonReader reader, string propertyName)
    {
      switch(propertyName)
      {
        ${fields.map(prop => `
        case nameof(${prop.name}):
          ${getTemplate(prop.dataType).readCode(prop.name)}
          return true;`.trim()).join('\n        ')}
        default:
          return false;
      }
    }
  }
}

// created by https://derive-definition-code.stackblitz.io/ version 0.4
`
  document.getElementById('target').innerHTML = result.trim();
});

let camelCase = (x: string) => x.substr(0,1).toLowerCase() + x.substr(1);
