// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Microsoft.AspNetCore.Mvc;
using Microsoft.OpenApi.OData;
using Microsoft.OpenApi;
using Microsoft.OpenApi.Extensions;
using Microsoft.OData.Edm;
using WuicCore.Server.Api.Models;

namespace WuicCore.Server.Api.Controllers
{
    /// <summary>
    /// This Controller exposes an Endpoint for the OpenAPI Schema, which will be generated from an <see cref="IEdmModel"/>.
    /// </summary>
    [Route("")]
    public class OpenApiController : ControllerBase
    {
        [HttpGet("odata/openapi.json")]
        public IActionResult GetOpenApiJson()
        {
            var edmModel = ApplicationEdmModel.GetEdmModel();

            var openApiSettings = new OpenApiConvertSettings
            {
                ServiceRoot = new("http://localhost"),
                PathPrefix = "odata",
                EnableKeyAsSegment = true,
            };

            var openApiDocument = edmModel.ConvertToOpenApi(openApiSettings);

            var openApiDocumentAsJson = openApiDocument.SerializeAsJson(OpenApiSpecVersion.OpenApi3_0);

            return Content(openApiDocumentAsJson, "application/json");

        }
    }
}
