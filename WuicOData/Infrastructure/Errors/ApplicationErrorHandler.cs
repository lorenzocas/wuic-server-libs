// Licensed under the MIT license. See LICENSE file in the project root for full license information.

#nullable enable

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.OData.Results;
using Microsoft.Extensions.Options;
using Microsoft.OData;
using System.Net;
using WuicCore.Server.Api.Infrastructure.OData;
using WuicCore.Server.Api.Infrastructure.Exceptions;
using WuicCore.Server.Api.Infrastructure.Logging;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Generic;
using System.Linq;

namespace WuicCore.Server.Api.Infrastructure.Errors
{

    /// <summary>
    /// Handles errors returned by the application.
    /// </summary>
    public class ApplicationErrorHandler
    {
        private readonly ILogger<ApplicationErrorHandler> _logger;

        private readonly ApplicationErrorHandlerOptions _options;

        public ApplicationErrorHandler(ILogger<ApplicationErrorHandler> logger, IOptions<ApplicationErrorHandlerOptions> options)
        {
            _logger = logger;
            _options = options.Value;
        }

        public ActionResult HandleInvalidModelState(HttpContext httpContext, ModelStateDictionary modelStateDictionary)
        {

            ODataError error = new ODataError()
            {
                Code = ErrorCodes.BadRequest,
                Message = "One or more validation errors occured",
                Details = GetODataErrorDetails(modelStateDictionary),
            };

            // a lower-level Exception. We cannot do anything sensible with exceptions, so 
            // we add them to the InnerError.
            var firstException = GetFirstException(modelStateDictionary);

            AddInnerError(httpContext, error, firstException);

            return new BadRequestObjectResult(error);
        }

        private static Exception? GetFirstException(ModelStateDictionary modelStateDictionary)
        {
            return modelStateDictionary
                .SelectMany(modelStateEntry => modelStateEntry.Value?.Errors ?? Enumerable.Empty<ModelError>())
                .Select(modelError => modelError.Exception)
                .FirstOrDefault(exception => exception != null);
        }

        private List<ODataErrorDetail> GetODataErrorDetails(ModelStateDictionary modelStateDictionary)
        {

            var result = new List<ODataErrorDetail>();

            foreach (var modelStateEntry in modelStateDictionary)
            {
                foreach (var modelError in modelStateEntry.Value.Errors)
                {
                    // We cannot make anything sensible for the caller here. We log it, but then go on 
                    // as if nothing has happened. Alternative is to populate a chain of ODataInnerError 
                    // or abuse the ODataErrorDetails...
                    if (modelError.Exception != null)
                    {
                        _logger.LogError(modelError.Exception, "Invalid ModelState due to an exception");

                        continue;
                    }

                    // A ModelStateDictionary has nothing like an "ErrorCode" and it's not 
                    // possible with existing infrastructure to get an "ErrorCode" here. So 
                    // we set a generic one.
                    var errorCode = ErrorCodes.ValidationFailed;

                    var odataErrorDetail = new ODataErrorDetail
                    {
                        Code = errorCode,
                        Message = modelError.ErrorMessage,
                        Target = modelStateEntry.Key,
                    };

                    result.Add(odataErrorDetail);
                }
            }

            return result;
        }

        public ActionResult HandleException(HttpContext httpContext, Exception exception)
        {

            _logger.LogError(exception, "Call to '{RequestPath}' failed due to an Exception", httpContext.Request.Path);

            return exception switch
            {
                Exception e => HandleSystemException(httpContext, e)
            };
        }

















        private ObjectResult HandleSystemException(HttpContext httpContext, Exception e)
        {

            var error = new ODataError
            {
                Code = ErrorCodes.InternalServerError,
                Message = "An Internal Server Error occured"
            };

            AddInnerError(httpContext, error, e);

            return new ObjectResult(error)
            {
                StatusCode = (int)HttpStatusCode.InternalServerError,
            };
        }

        private void AddInnerError(HttpContext httpContext, ODataError error, Exception? e)
        {

            error.InnerError = new ODataInnerError();

            error.InnerError.Properties["trace-id"] = new ODataPrimitiveValue(httpContext.TraceIdentifier);

            if (e != null && _options.IncludeExceptionDetails)
            {
                error.InnerError.Properties["message"] = new ODataPrimitiveValue(e.Message);
                error.InnerError.Properties["type"] = new ODataPrimitiveValue(e.GetType().Name);
                error.InnerError.Properties["stacktrace"] = new ODataPrimitiveValue(e.StackTrace);
            }
        }
    }
}
