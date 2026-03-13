# NugetHost

Host ASP.NET Core minimale che esegue `CrmApp` come dipendenza NuGet (`CrmApp` 1.0.0).

## Cosa fa

- Carica `WuicCore.Startup` dal pacchetto NuGet.
- Si mette in ascolto su `http://localhost:5000`.
- Riusa `../CrmApp` come content root per mantenere static files e parte Angular.

## Prerequisiti

- Pacchetto locale in `../CrmApp/nupkg_slim/CrmApp.1.0.0.nupkg`.

## Avvio

```powershell
dotnet run --project .\CrmApp\CrmApp.csproj
```

## Override root contenuti

Se serve una root diversa:

```powershell
$env:KONVERGENCECORE_ROOT = "C:\\path\\to\\CrmApp"
dotnet run --project .\NugetHost\NugetHost.csproj
```

## Parametro appsettings per static/angular

Nel progetto `CrmApp` puoi configurare la root dei contenuti statici/Angular con:

```json
"CrmApp": {
	"StaticAngularRoot": "..\\CrmApp"
}
```

`KONVERGENCECORE_ROOT` (variabile ambiente) ha priorita` su questo valore.
