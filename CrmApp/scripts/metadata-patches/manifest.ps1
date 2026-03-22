<#
  Manifest patch metadata per richiesta.
  - Enabled: puo essere usato dal runner
  - Script: path relativo a questo file
#>

@(
  @{
    Id = '20260317_grid_conditional_visibility'
    Description = 'Regole visive condizionali griglie CRM (opportunities/leads/activities).'
    Enabled = $true
    Script = '20260317-grid-conditional-visibility.patch.ps1'
  }
  @{
    Id = '20260317_example'
    Description = 'Template patch (no-op) da copiare per nuove richieste.'
    Enabled = $true
    Script = '20260317-example.patch.ps1'
  }
  @{
    Id = '20260322_crm_cases_sla'
    Description = 'SLA automatiche per priorita case (colonne SLA + stile grid condizionale).'
    Enabled = $true
    Script = '20260322-crm-cases-sla.patch.ps1'
  }
)

