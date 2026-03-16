param(
    [string]$PythonExe = "c:\src\Wuic\KonvergenceCore\.venv\Scripts\python.exe",
    [string]$RootDir = "c:\src\Wuic",
    [string]$ExtractScript = "c:\src\Wuic\codebase_docs\extract_codebase.py",
    [string]$BuildScript = "c:\src\Wuic\codebase_embeddings\generate_embeddings.py",
    [string]$EvalScript = "c:\src\Wuic\codebase_embeddings\evaluate_rag.py",
    [string]$EmbedModel = "BAAI/bge-m3",
    [int]$EmbedBatchSize = 8,
    [string]$ChunksJsonl = "c:\src\Wuic\codebase_docs\code_chunks.jsonl",
    [string]$IndexDir = "c:\src\Wuic\codebase_embeddings\index",
    [string]$EvalFile = "c:\src\Wuic\codebase_embeddings\eval_queries.jsonl",
    [string]$EvalOutput = "c:\src\Wuic\codebase_embeddings\eval_results.json",
    [string]$EvalHistory = "c:\src\Wuic\codebase_embeddings\eval_results_history.jsonl",
    [string]$HfToken = "",
    [string]$HfTokenEnv = "RAG_HF_TOKEN",
    [double]$AlphaVector = 0.45,
    [double]$AlphaBm25 = 0.55,
    [switch]$AdaptiveAlpha,
    [double]$AlphaVectorTechnical = 0.05,
    [double]$AlphaVectorDescriptive = 0.70,
    [double]$RerankSymbolWeight = 1.10,
    [double]$RerankPathWeight = 0.60,
    [double]$RerankTextOverlapWeight = 0.80,
    [int]$TopK = 5,
    [string]$TopKList = "",
    [switch]$SkipDb,
    [switch]$NoBuildResume
)

$ErrorActionPreference = "Stop"

function Ensure-FileExists {
    param([string]$Path, [string]$Hint)
    if (-not (Test-Path $Path)) {
        throw "Missing file: $Path`n$Hint"
    }
}

function Run-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $Action
    $sw.Stop()
    Write-Host ("[ok] {0} ({1:n1}s)" -f $Name, $sw.Elapsed.TotalSeconds) -ForegroundColor Green
}

function Invoke-PythonChecked {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)
    & $PythonExe @Args
    if ($LASTEXITCODE -ne 0) {
        throw "Python command failed (exit code $LASTEXITCODE): $PythonExe $($Args -join ' ')"
    }
}

function Load-Metrics {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    try {
        return Get-Content $Path -Raw | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Write-Summary {
    param(
        [object]$Current,
        [object]$Previous,
        [int]$TopK
    )
    $hitKey = "hit@$TopK"
    $curHit = if ($Current.PSObject.Properties.Name -contains $hitKey) { [double]$Current.$hitKey } else { $null }
    $curMrr = if ($Current.PSObject.Properties.Name -contains "mrr") { [double]$Current.mrr } else { $null }

    Write-Host ""
    Write-Host "=== Summary ===" -ForegroundColor Cyan
    if ($null -ne $curHit) { Write-Host ("{0}: {1:P2}" -f $hitKey, $curHit) }
    if ($null -ne $curMrr) { Write-Host ("mrr: {0:N4}" -f $curMrr) }
    if ($Current.PSObject.Properties.Name -contains "total_cases") { Write-Host ("total_cases: {0}" -f $Current.total_cases) }

    if ($null -ne $Previous) {
        $prevHit = if ($Previous.PSObject.Properties.Name -contains $hitKey) { [double]$Previous.$hitKey } else { $null }
        $prevMrr = if ($Previous.PSObject.Properties.Name -contains "mrr") { [double]$Previous.mrr } else { $null }
        Write-Host ""
        Write-Host "=== Delta vs Previous ===" -ForegroundColor Yellow
        if ($null -ne $curHit -and $null -ne $prevHit) {
            $deltaHit = $curHit - $prevHit
            Write-Host ("{0}: {1:+0.00%;-0.00%;0.00%}" -f $hitKey, $deltaHit)
        }
        if ($null -ne $curMrr -and $null -ne $prevMrr) {
            $deltaMrr = $curMrr - $prevMrr
            Write-Host ("mrr: {0:+0.0000;-0.0000;0.0000}" -f $deltaMrr)
        }
    }
}

function Parse-TopKs {
    param([string]$TopKList, [int]$TopK)

    if ([string]::IsNullOrWhiteSpace($TopKList)) {
        return @($TopK)
    }

    $vals = @()
    foreach ($part in ($TopKList -split ",")) {
        $p = ""
        if ($null -ne $part) {
            $p = ([string]$part).Trim()
        }
        if ([string]::IsNullOrWhiteSpace($p)) { continue }
        $n = 0
        if ([int]::TryParse($p, [ref]$n) -and $n -gt 0) {
            $vals += $n
        }
    }

    if ($vals.Count -eq 0) {
        return @($TopK)
    }

    return ($vals | Sort-Object -Unique)
}

function Build-AdaptiveArgs {
    $args = @()
    if ($AdaptiveAlpha) { $args += "--adaptive-alpha" }
    $args += @(
        "--alpha-vector-technical", "$AlphaVectorTechnical",
        "--alpha-vector-descriptive", "$AlphaVectorDescriptive",
        "--rerank-symbol-weight", "$RerankSymbolWeight",
        "--rerank-path-weight", "$RerankPathWeight",
        "--rerank-text-overlap-weight", "$RerankTextOverlapWeight"
    )
    return $args
}

Ensure-FileExists -Path $ExtractScript -Hint "Check path to extract_codebase.py"
Ensure-FileExists -Path $BuildScript -Hint "Check path to generate_embeddings.py"
Ensure-FileExists -Path $EvalScript -Hint "Check path to evaluate_rag.py"
Ensure-FileExists -Path $EvalFile -Hint "Create eval_queries.jsonl (you can copy eval_queries.sample.jsonl)"

$previousMetrics = Load-Metrics -Path $EvalOutput

if (-not [string]::IsNullOrWhiteSpace($HfToken)) {
    Set-Item -Path ("Env:{0}" -f $HfTokenEnv) -Value $HfToken
}

if (-not $SkipDb) {
    Run-Step -Name "Check python dependency (pyodbc)" -Action {
        Invoke-PythonChecked -c "import pyodbc; print('pyodbc ok')"
    }
}

Run-Step -Name "Extract chunks" -Action {
    if ($SkipDb) {
        Invoke-PythonChecked $ExtractScript --root-dir $RootDir --output-jsonl $ChunksJsonl --skip-db
    }
    else {
        Invoke-PythonChecked $ExtractScript --root-dir $RootDir --output-jsonl $ChunksJsonl
    }
}

Ensure-FileExists -Path $ChunksJsonl -Hint "Extraction did not produce code_chunks.jsonl. Run extract_codebase.py manually and verify errors."

Run-Step -Name "Build hybrid index" -Action {
    $buildArgs = @(
        $BuildScript,
        "build",
        "--input-jsonl", $ChunksJsonl,
        "--output-dir", $IndexDir,
        "--model", $EmbedModel,
        "--batch-size", "$EmbedBatchSize",
        "--hf-token-env", $HfTokenEnv
    )
    if (-not $NoBuildResume) { $buildArgs += "--resume-build" }
    Invoke-PythonChecked @buildArgs
}

Ensure-FileExists -Path (Join-Path $IndexDir "vectors.npy") -Hint "Index build did not produce vectors.npy."
Ensure-FileExists -Path (Join-Path $IndexDir "metadata.jsonl") -Hint "Index build did not produce metadata.jsonl."

 $topKs = Parse-TopKs -TopKList $TopKList -TopK $TopK
 $multiSummary = [ordered]@{
    timestamp_utc = [DateTime]::UtcNow.ToString("o")
    index_dir = $IndexDir
    eval_file = $EvalFile
    runs = @()
 }

Run-Step -Name "Evaluate index" -Action {
    $adaptiveArgs = Build-AdaptiveArgs
    foreach ($k in $topKs) {
        $targetOutput = if ($topKs.Count -gt 1) {
            [System.IO.Path]::ChangeExtension($EvalOutput, $null) + "_top$k.json"
        }
        else {
            $EvalOutput
        }

        Invoke-PythonChecked $EvalScript --index-dir $IndexDir --eval-file $EvalFile --top-k $k --output-json $targetOutput --hf-token-env $HfTokenEnv --alpha-vector $AlphaVector --alpha-bm25 $AlphaBm25 @adaptiveArgs
        $metrics = Load-Metrics -Path $targetOutput
        if ($null -eq $metrics) {
            throw "Could not load metrics from $targetOutput"
        }
        $run = [ordered]@{
            top_k = $k
            output_json = $targetOutput
            hit = $metrics."hit@$k"
            mrr = $metrics.mrr
            total_cases = $metrics.total_cases
            alpha_vector = $metrics.alpha_vector
            alpha_bm25 = $metrics.alpha_bm25
            adaptive_alpha = $metrics.adaptive_alpha
        }
        $multiSummary.runs += $run
    }
}

$currentMetrics = $null
if ($topKs.Count -gt 1) {
    $selected = $multiSummary.runs | Where-Object { $_.top_k -eq $TopK } | Select-Object -First 1
    if ($null -eq $selected) {
        $selected = $multiSummary.runs | Select-Object -First 1
    }
    $currentMetrics = [ordered]@{
        total_cases = $selected.total_cases
        "hit@$TopK" = $selected.hit
        mrr = $selected.mrr
    }

    $multiPath = [System.IO.Path]::ChangeExtension($EvalOutput, $null) + "_by_k.json"
    ($multiSummary | ConvertTo-Json -Depth 8) | Set-Content -Path $multiPath -Encoding UTF8
    Write-Host ("[eval] by-k summary written to: {0}" -f $multiPath)
}
else {
    $currentMetrics = Load-Metrics -Path $EvalOutput
    if ($null -eq $currentMetrics) {
        throw "Could not load metrics from $EvalOutput"
    }
}

Write-Summary -Current $currentMetrics -Previous $previousMetrics -TopK $TopK

$historyEntry = [ordered]@{
    timestamp_utc = [DateTime]::UtcNow.ToString("o")
    embed_model   = $EmbedModel
    embed_batch_size = $EmbedBatchSize
    build_resume = (-not [bool]$NoBuildResume)
    top_k         = $TopK
    top_k_list    = $topKs
    alpha_vector  = $AlphaVector
    alpha_bm25    = $AlphaBm25
    adaptive_alpha = [bool]$AdaptiveAlpha
    alpha_vector_technical = $AlphaVectorTechnical
    alpha_vector_descriptive = $AlphaVectorDescriptive
    rerank_symbol_weight = $RerankSymbolWeight
    rerank_path_weight = $RerankPathWeight
    rerank_text_overlap_weight = $RerankTextOverlapWeight
    metrics       = $currentMetrics
}

$historyDir = Split-Path $EvalHistory -Parent
if ($historyDir -and -not (Test-Path $historyDir)) {
    New-Item -ItemType Directory -Path $historyDir | Out-Null
}

($historyEntry | ConvertTo-Json -Compress) | Add-Content -Path $EvalHistory -Encoding UTF8

Write-Host ""
Write-Host "[done] pipeline completed." -ForegroundColor Green
Write-Host ("metrics: {0}" -f $EvalOutput)
Write-Host ("history: {0}" -f $EvalHistory)
