using System;

using System.Collections.Generic;
using System.Xml.Serialization;

namespace WEB_UI_CRAFTER.Helpers
{
    [XmlRoot("dictionary")]
    public class SerializableDictionary<TKey, TValue>
        : Dictionary<TKey, TValue>, IXmlSerializable
    {

        #region IXmlSerializable Members

        public System.Xml.Schema.XmlSchema GetSchema()
        {
            return null;
        }

        public void ReadXml(System.Xml.XmlReader reader)
        {
            XmlSerializer keySerializer = new XmlSerializer(typeof(TKey));
            XmlSerializer valueSerializer = new XmlSerializer(typeof(TValue));
            bool wasEmpty = reader.IsEmptyElement;
            reader.Read();
            if (wasEmpty)
                return;
            while (reader.NodeType != System.Xml.XmlNodeType.EndElement)
            {

                string peek = reader.ReadOuterXml();

                reader.ReadStartElement("item");
                reader.ReadStartElement("key");
                TKey key = (TKey)(System.Convert.ChangeType(reader.Value, typeof(TKey)));
                reader.ReadContentAsString();
                reader.ReadEndElement();
                reader.ReadStartElement("value");
                TValue value = (TValue)(System.Convert.ChangeType(reader.Value, typeof(TValue)));
                reader.ReadContentAsString();
                reader.ReadEndElement();
                this.Add(key, value);
                reader.ReadEndElement();
                reader.MoveToContent();
            }
            reader.ReadEndElement();
        }

        public void WriteXml(System.Xml.XmlWriter writer)
        {
            XmlSerializer keySerializer = new XmlSerializer(typeof(TKey));
            XmlSerializer valueSerializer = new XmlSerializer(typeof(TValue));
            foreach (TKey key in this.Keys)
            {
                writer.WriteStartElement("item");
                writer.WriteStartElement("key");
                keySerializer.Serialize(writer, key);
                writer.WriteEndElement();
                writer.WriteStartElement("value");
                TValue value = this[key];
                valueSerializer.Serialize(writer, value);
                writer.WriteEndElement();
                writer.WriteEndElement();
            }
        }

        public static SerializableDictionary<TKey, TValue> convertDictionary(Dictionary<TKey, TValue> dict)
        {
            SerializableDictionary<TKey, TValue> ser = new SerializableDictionary<TKey, TValue>();
            foreach (TKey k in dict.Keys)
            {
                ser.Add(k, dict[k]);
            }

            return ser;
        }

        public static List<SerializableDictionary<TKey, TValue>> convertDictionaryList(List<Dictionary<TKey, TValue>> dicts)
        {
            List<SerializableDictionary<TKey, TValue>> ret = new List<SerializableDictionary<TKey, TValue>>();
            foreach (Dictionary<TKey, TValue> dict in dicts)
            {
                ret.Add(SerializableDictionary<TKey, TValue>.convertDictionary(dict));
            }
            return ret;
        }

        #endregion

    }
}