using Dapper;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.FileProviders;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Configuration;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using WEB_UI_CRAFTER.Helpers;

namespace System.WebCore
{
    public class HttpContext
    {
        private static readonly JsonSerializerOptions ParameterDeserializeOptions = CreateParameterDeserializeOptions();

        public static bool trace = ConfigurationManager.AppSettings.AllKeys.Contains("traceQuery") ? ParseBool(ConfigurationManager.AppSettings["traceQuery"]) : false;

        public static ContentResult AsmxProxy(dynamic pmr, string fullMethodName)
        {
            object myInstance;
            MethodInfo method;
            List<object> parameters;
            string methodName;
            reflector(pmr, fullMethodName, out myInstance, out method, out parameters, out methodName);

            try
            {
                Stopwatch sw = new Stopwatch();
                sw.Start();

                object ret = method.Invoke(myInstance, parameters.ToArray());

                sw.Stop();

                tracer(pmr, methodName, sw);

                if (ret == null)
                {
                    return new ContentResult()
                    {
                        Content = "",
                        ContentType = "application/json"
                    };
                }

                if (ret.GetType() == typeof(String))
                {
                    return new ContentResult()
                    {
                        Content = ret?.ToString() ?? string.Empty,
                        ContentType = "application/json"
                    };

                }
                else
                {
                    return new ContentResult()
                    {
                        Content = JsonSerializer.Serialize(ret),
                        ContentType = "application/json"
                    };
                }
            }
            catch (Exception ex)
            {
                throw ex.InnerException == null ? ex : ex.InnerException;
            }
        }

        private static void tracer(dynamic pmr, string methodName, Stopwatch sw)
        {
            if (trace)
            {
                new System.Threading.Thread(x =>
                {
                    string connStr = ConfigurationManager.ConnectionStrings["MetaDataSQLConnection"].ConnectionString;
                    using (SqlConnection con = new SqlConnection(connStr))
                    {
                        con.Open();
                        string json = pmr.ToString();
                        con.Execute("insert into _error__logs(error_date1, error_exception1, error_method1, error_query1) VALUES(getdate(), @msg, @method, @qry)", new { msg = string.Format("{0}", sw.Elapsed.TotalSeconds), method = methodName, qry = json });
                    }
                }).Start();
            }
        }

        private static void reflector(dynamic pmr, string fullMethodName, out object myInstance, out MethodInfo method, out List<object> parameters, out string methodName)
        {
            Type myType = null;
            method = null;
            List<ParameterInfo> parametersInfo;
            parameters = new List<object>();

            var fullMethodNameRaw = (fullMethodName ?? string.Empty).Trim();
            int lastDotIndex = fullMethodNameRaw.LastIndexOf('.');
            if (lastDotIndex <= 0 || lastDotIndex >= fullMethodNameRaw.Length - 1)
            {
                throw new ArgumentException(
                    $"Invalid method format '{fullMethodNameRaw}'. Expected '<service>.<method>' or '<namespace>.<class>.<method>'.",
                    nameof(fullMethodName));
            }

            methodName = fullMethodNameRaw.Substring(lastDotIndex + 1).Trim();
            string serviceClassName = fullMethodNameRaw.Substring(0, lastDotIndex).Trim();
            if (string.IsNullOrWhiteSpace(serviceClassName))
            {
                throw new ArgumentException(
                    $"Invalid service name in '{fullMethodNameRaw}'.",
                    nameof(fullMethodName));
            }

            string serviceClassLeafName = serviceClassName.Split('.').LastOrDefault()?.Trim() ?? string.Empty;
            string className = string.Empty;

            bool isFullQualifiedClassName = serviceClassName.Contains('.');
            if (isFullQualifiedClassName)
            {
                className = serviceClassName;
            }
            else if (serviceClassLeafName.Equals("metaservice", StringComparison.OrdinalIgnoreCase))
            {
                className = "ngUicServicesCore.Controllers.MetaService";
            }
            else if (serviceClassLeafName.Equals("_metadati_suggestions", StringComparison.OrdinalIgnoreCase))
            {
                className = "metaModelRaw._Metadati_suggestions";
            }
            else if (serviceClassLeafName.Equals("utility", StringComparison.OrdinalIgnoreCase))
            {
                className = "WEB_UI_CRAFTER.ProjectData.Servizi.Utility";
            }
            else if (serviceClassLeafName.Equals("scaffolding", StringComparison.OrdinalIgnoreCase))
            {
                className = "metaModelRaw.scaffolding";
            }
            else if (serviceClassLeafName.Equals("mysqlscaffolding", StringComparison.OrdinalIgnoreCase))
            {
                className = "metaModelRaw.MySqlscaffolding";
            }
            else
            {
                className = "WEB_UI_CRAFTER.ProjectData.Servizi." + serviceClassName;
            }

            string methodCacheKey = className + "." + methodName;
            ((ConcurrentDictionary<string, object>)Current.Application["instances"]).TryGetValue(className, out myInstance);
            ((ConcurrentDictionary<string, MethodInfo>)HttpContext.Current.Application["methods"]).TryGetValue(methodCacheKey, out method);
            ((ConcurrentDictionary<string, List<ParameterInfo>>)HttpContext.Current.Application["parameters"]).TryGetValue(methodCacheKey, out parametersInfo);

            if (myInstance == null || method == null || parametersInfo == null)
            {
                Assembly customerAssembly = System.Reflection.Assembly.GetEntryAssembly();
                myType = customerAssembly.GetType(className);
                if (myType == null)
                {
                    throw new TypeLoadException($"Service class not found for '{fullMethodNameRaw}'. Resolved class: '{className}'.");
                }

                if (myInstance == null)
                {
                    myInstance = Activator.CreateInstance(myType);
                }

                if (method == null)
                {
                    method = myType.GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.IgnoreCase);
                }

                if (method == null)
                {
                    throw new MissingMethodException(
                        $"Method not found for '{fullMethodNameRaw}'. " +
                        $"Resolved class: '{className}', requested method: '{methodName}'.");
                }

                parametersInfo = method.GetParameters().ToList();

                ((ConcurrentDictionary<string, object>)HttpContext.Current.Application["instances"]).TryAdd(className, myInstance);
                ((ConcurrentDictionary<string, MethodInfo>)HttpContext.Current.Application["methods"]).TryAdd(methodCacheKey, method);
                ((ConcurrentDictionary<string, List<ParameterInfo>>)HttpContext.Current.Application["parameters"]).TryAdd(methodCacheKey, parametersInfo);
            }

            ParseParameters(pmr, parameters, parametersInfo);
        }

        public static bool ParseBool(object obj)
        {
            if (obj == null || obj == DBNull.Value)
            {
                return false;
            }
            else
            {
                string ret = ParseNull(obj);
                if (ret.ToLower() == "true" || ret == "1" || ret == "-1")
                    return true;
                else
                    return false;
            }
        }

        public static string ParseNull(object obj)
        {
            if (obj == null || obj == DBNull.Value)
            {
                return "";
            }
            else
            {
                return obj.ToString();
            }
        }

        private static void ParseParameters(dynamic pmr, List<object> parameters, List<ParameterInfo> parametersInfo)
        {
            foreach (var parameterInfo in parametersInfo)
            {
                string name = parameterInfo.Name;
                object value;
                bool found = TryGetParameterValue(pmr, name, out value);
                value = NormalizeDynamicValue(value);

                if (found && value != null)
                {
                    Type tipo = parameterInfo.ParameterType;

                    if (tipo == typeof(System.String))
                    {
                        parameters.Add(CoerceToStringParameterValue(value));
                    }
                    else if (tipo == typeof(System.Boolean))
                    {
                        parameters.Add(ParseBool(value.ToString()));
                    }
                    else
                    {
                        if (tipo == typeof(SerializableDictionary<string, object>))
                        {
                            SerializableDictionary<string, object> converted = DeserializeToSerializableDictionary(value);

                            parameters.Add(converted);
                        }
                        else if (tipo == typeof(Dictionary<string, object>))
                        {
                            string rawValue = CoerceToJsonString(value);
                            if (string.IsNullOrWhiteSpace(rawValue) || rawValue.Trim() == "[]")
                            {
                                parameters.Add(new Dictionary<string, object>());
                                continue;
                            }

                            var converted = DeserializeToDictionary(rawValue);

                            parameters.Add(converted);
                        }
                        else if (tipo.ToString() == "System.Object")
                        {
                            string rawValue = CoerceToJsonString(value);
                            if (string.IsNullOrWhiteSpace(rawValue))
                            {
                                parameters.Add(null);
                                continue;
                            }

                            JsonDocument token;
                            try
                            {
                                token = JsonDocument.Parse(rawValue);
                            }
                            catch
                            {
                                parameters.Add(rawValue);
                                continue;
                            }

                            if (token.RootElement.ValueKind == JsonValueKind.Object)
                            {
                                var converted = DeserializeToDictionary(rawValue);
                                parameters.Add(converted);
                            }
                            else if (token.RootElement.ValueKind == JsonValueKind.Array)
                            {
                                parameters.Add(DeserializeToObject(rawValue));
                            }
                            else
                            {
                                parameters.Add(ConvertJsonElementToObject(token.RootElement));
                            }

                            token.Dispose();
                        }
                        else
                        {
                            parameters.Add(DeserializeParameterValue(value, tipo));
                        }
                    }
                }
                else
                {
                    parameters.Add(null);
                }
            }
        }

        private static object DeserializeParameterValue(object value, Type targetType)
        {
            if (value == null)
            {
                return null;
            }

            string rawValue = value as string ?? JsonSerializer.Serialize(value);
            return JsonSerializer.Deserialize(rawValue, targetType, ParameterDeserializeOptions);
        }

        private static string CoerceToStringParameterValue(object value)
        {
            if (value == null)
            {
                return null;
            }

            if (value is string s)
            {
                return s;
            }

            // Preserve structural payloads when a string parameter receives object/array tokens.
            if (value is JsonElement element)
            {
                return element.ValueKind == JsonValueKind.String ? element.GetString() : element.GetRawText();
            }

            if (value is IDictionary<string, object> || value is System.Collections.IDictionary || value is System.Collections.IEnumerable)
            {
                return CoerceToJsonString(value);
            }

            return value.ToString();
        }

        private static JsonSerializerOptions CreateParameterDeserializeOptions()
        {
            JsonSerializerOptions options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            options.Converters.Add(new FlexibleStringJsonConverter());
            return options;
        }

        private sealed class FlexibleStringJsonConverter : System.Text.Json.Serialization.JsonConverter<string>
        {
            public override string Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
                switch (reader.TokenType)
                {
                    case JsonTokenType.String:
                        return reader.GetString();
                    case JsonTokenType.Null:
                        return null;
                    default:
                        using (JsonDocument document = JsonDocument.ParseValue(ref reader))
                        {
                            return document.RootElement.ToString();
                        }
                }
            }

            public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
            {
                writer.WriteStringValue(value);
            }
        }

        private static bool TryGetParameterValue(object pmr, string parameterName, out object value)
        {
            value = null;
            if (pmr == null)
            {
                return false;
            }

            if (pmr is JsonTokenType)
            {
                value = pmr.ToString();
                return true;
            }

            if (pmr is JsonElement jsonElement)
            {
                if (jsonElement.ValueKind == JsonValueKind.Object && TryGetJsonPropertyCaseInsensitive(jsonElement, parameterName, out JsonElement property))
                {
                    value = ConvertJsonElementToObject(property);
                    return true;
                }

                return false;
            }

            if (pmr is JsonDocument jsonDocument)
            {
                return TryGetParameterValue(jsonDocument.RootElement, parameterName, out value);
            }

            if (pmr is IDictionary<string, object> dict)
            {
                if (TryGetDictionaryValueCaseInsensitive(dict, parameterName, out object dictValue))
                {
                    value = NormalizeDynamicValue(dictValue);
                    return true;
                }

                return false;
            }

            // Support payloads coming from Newtonsoft JToken/JObject or other json-like dynamic wrappers.
            if (TryGetParameterValueFromJsonLikeObject(pmr, parameterName, out object jsonLikeValue))
            {
                value = jsonLikeValue;
                return true;
            }

            PropertyInfo prop = pmr.GetType().GetProperty(parameterName, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
            if (prop != null)
            {
                value = NormalizeDynamicValue(prop.GetValue(pmr));
                return true;
            }

            return false;
        }

        private static bool TryGetParameterValueFromJsonLikeObject(object pmr, string parameterName, out object value)
        {
            value = null;
            if (pmr == null)
            {
                return false;
            }

            string rawValue;
            try
            {
                rawValue = pmr.ToString();
            }
            catch
            {
                return false;
            }

            if (string.IsNullOrWhiteSpace(rawValue))
            {
                return false;
            }

            string trimmed = rawValue.Trim();
            if (!(trimmed.StartsWith("{") && trimmed.EndsWith("}")))
            {
                return false;
            }

            try
            {
                using JsonDocument doc = JsonDocument.Parse(trimmed);
                if (doc.RootElement.ValueKind == JsonValueKind.Object && TryGetJsonPropertyCaseInsensitive(doc.RootElement, parameterName, out JsonElement property))
                {
                    value = ConvertJsonElementToObject(property);
                    return true;
                }
            }
            catch
            {
                return false;
            }

            return false;
        }

        private static bool TryGetJsonPropertyCaseInsensitive(JsonElement element, string propertyName, out JsonElement property)
        {
            if (element.TryGetProperty(propertyName, out property))
            {
                return true;
            }

            foreach (JsonProperty p in element.EnumerateObject())
            {
                if (string.Equals(p.Name, propertyName, StringComparison.OrdinalIgnoreCase))
                {
                    property = p.Value;
                    return true;
                }
            }

            property = default;
            return false;
        }

        private static bool TryGetDictionaryValueCaseInsensitive(IDictionary<string, object> dict, string key, out object value)
        {
            if (dict.TryGetValue(key, out value))
            {
                return true;
            }

            foreach (KeyValuePair<string, object> pair in dict)
            {
                if (string.Equals(pair.Key, key, StringComparison.OrdinalIgnoreCase))
                {
                    value = pair.Value;
                    return true;
                }
            }

            value = null;
            return false;
        }

        private static object NormalizeDynamicValue(object value)
        {
            if (value is JsonElement element)
            {
                return ConvertJsonElementToObject(element);
            }

            return value;
        }

        private static string CoerceToJsonString(object value)
        {
            if (value == null)
            {
                return string.Empty;
            }

            if (value is string s)
            {
                return s;
            }

            return JsonSerializer.Serialize(value);
        }

        private static Dictionary<string, object> DeserializeToDictionary(string json)
        {
            object normalized = DeserializeToObject(json);
            return normalized as Dictionary<string, object> ?? new Dictionary<string, object>();
        }

        private static SerializableDictionary<string, object> DeserializeToSerializableDictionary(object input)
        {
            if (input is SerializableDictionary<string, object> existingSerializable)
            {
                return existingSerializable;
            }

            if (input is Dictionary<string, object> existingDictionary)
            {
                SerializableDictionary<string, object> fromDictionary = new SerializableDictionary<string, object>();
                foreach (KeyValuePair<string, object> pair in existingDictionary)
                {
                    fromDictionary[pair.Key] = pair.Value;
                }

                return fromDictionary;
            }

            Dictionary<string, object> dict = DeserializeToDictionary(CoerceToJsonString(input));
            SerializableDictionary<string, object> serializable = new SerializableDictionary<string, object>();
            foreach (KeyValuePair<string, object> pair in dict)
            {
                serializable[pair.Key] = pair.Value;
            }

            return serializable;
        }

        private static object DeserializeToObject(string json)
        {
            using JsonDocument doc = JsonDocument.Parse(json);
            return ConvertJsonElementToObject(doc.RootElement);
        }

        private static object ConvertJsonElementToObject(JsonElement element)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.Object:
                    Dictionary<string, object> obj = new Dictionary<string, object>();
                    foreach (JsonProperty prop in element.EnumerateObject())
                    {
                        obj[prop.Name] = ConvertJsonElementToObject(prop.Value);
                    }
                    return obj;

                case JsonValueKind.Array:
                    List<object> arr = new List<object>();
                    foreach (JsonElement item in element.EnumerateArray())
                    {
                        arr.Add(ConvertJsonElementToObject(item));
                    }
                    return arr;

                case JsonValueKind.String:
                    if (element.TryGetDateTime(out DateTime dateTime))
                    {
                        return dateTime;
                    }
                    return element.GetString();

                case JsonValueKind.Number:
                    if (element.TryGetInt64(out long l)) return l;
                    if (element.TryGetDecimal(out decimal d)) return d;
                    return element.GetDouble();

                case JsonValueKind.True:
                case JsonValueKind.False:
                    return element.GetBoolean();

                case JsonValueKind.Null:
                case JsonValueKind.Undefined:
                    return null;

                default:
                    return element.ToString();
            }
        }

        private static bool dt(dynamic mm)
        {
            if (mm.Year >= 2020 && (mm.Month > 4))
            {
                return true;
            }
            return false;
        }

        static IHttpContextAccessor _accessor;
        static object _env;
        static string _contentRootPath;
        static string _webRootPath;
        static IFileProvider _contentRootFileProvider;

        public static ContextCurrent Current;

        public static ContextCurrent Configure(IHttpContextAccessor httpContextAccessor, object hosting)
        {
            _accessor = httpContextAccessor;
            _env = hosting;
            _contentRootPath = ResolveStringProperty(hosting, "ContentRootPath") ?? Directory.GetCurrentDirectory();
            _webRootPath = ResolveStringProperty(hosting, "WebRootPath") ?? Path.Combine(_contentRootPath, "wwwroot");
            _contentRootFileProvider = ResolveFileProviderProperty(hosting, "ContentRootFileProvider") ?? new NullFileProvider();
            Current = new ContextCurrent();

            return Current;
        }

        private static string ResolveStringProperty(object target, string propertyName)
        {
            return target?.GetType().GetProperty(propertyName)?.GetValue(target)?.ToString();
        }

        private static IFileProvider ResolveFileProviderProperty(object target, string propertyName)
        {
            return target?.GetType().GetProperty(propertyName)?.GetValue(target) as IFileProvider;
        }

        //public static Microsoft.AspNetCore.Http.HttpContext Current => _accessor.HttpContext;
        public string rootPath => _webRootPath;

        public class ContextCurrent
        {
            public ContextCurrent()
            {
                Server = new ContextServer();
                Request = new ContextRequest();
            }

            static DefaultableDictionary<string, object> _application;

            public DefaultableDictionary<string, object> Application
            {
                get
                {
                    return _application;
                }
                set
                {
                    _application = value;
                }
            }

            SessionWrapper _session;
            public SessionWrapper Session
            {
                get
                {
                    if (_session == null)
                    {
                        _session = new SessionWrapper(_accessor);
                    }
                    return _session;
                }
            }
            public ContextServer Server;
            public ContextRequest Request;
            public dynamic Response
            {
                get
                {
                    return _accessor.HttpContext.Response;
                }
            }
        }

        public class ContextServer
        {
            public string MapPath(string path)
            {
                string webRootPath = _webRootPath;
                string contentRootPath = _contentRootPath;
                string combined = System.IO.Path.Combine(webRootPath, path.Replace("~/", "").Replace("/", @"\"));
                string absolutePath;

                IFileInfo fi = _contentRootFileProvider.GetFileInfo(combined);

                if (fi.Exists)
                {
                    absolutePath = combined;
                }
                else
                {
                    DirectoryInfo di = new DirectoryInfo(combined);
                    absolutePath = di.FullName;
                }

                return absolutePath;
            }

        }

        public class ContextRequest
        {
            CookieWrapper _cookies;

            public string UserHostAddress
            {
                get
                {
                    return _accessor.HttpContext.Connection.RemoteIpAddress.ToString();
                }
            }

            public CookieWrapper Cookies
            {
                get
                {
                    if (_cookies == null)
                    {
                        _cookies = new CookieWrapper(_accessor);
                    }
                    return _cookies;
                }
            }

            public IFormCollection Form
            {
                get
                {
                    return _accessor.HttpContext.Request.Form;
                }
            }

            public string MapPath(string path)
            {
                return "";
            }
        }

        public class SessionWrapper : Dictionary<string, object>
        {
            IHttpContextAccessor _acc;
            public SessionWrapper(IHttpContextAccessor acc)
            {
                _acc = acc;
            }

            public object this[string key]
            {
                // returns value if exists
                get
                {
                    string value = _acc.HttpContext.Session.GetString(key);
                    if (string.IsNullOrWhiteSpace(value))
                    {
                        return null;
                    }
                    return DeserializeToObject(value);
                }

                // updates if exists, adds if doesn't exist
                set
                {
                    _acc.HttpContext.Session.SetString(key, JsonSerializer.Serialize(value));
                }
            }
        }

        public class HttpCookie
        {
            public string Value { get; set; }
            public string Key { get; set; }

            public HttpCookie(string key, string value)
            {
                Value = value;
                Key = key;
            }
        }

        public class CookieWrapper : Dictionary<string, HttpCookie>
        {
            IHttpContextAccessor _acc;

            public CookieWrapper(IHttpContextAccessor acc)
            {
                _acc = acc;
            }

            public HttpCookie this[string key]
            {
                // returns value if exists
                get
                {
                    return new HttpCookie(key, _acc.HttpContext == null ? null : _acc.HttpContext.Request.Cookies[key]);
                }

                // updates if exists, adds if doesn't exist
                set
                {
                    _acc.HttpContext.Response.Cookies.Append(key, value.Value);
                }
            }

        }
    }
}
