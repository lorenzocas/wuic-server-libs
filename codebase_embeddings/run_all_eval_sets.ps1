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
    [string]$EvalDir = "c:\src\Wuic\codebase_embeddings",
    [string]$EvalPattern = "eval_queries*.jsonl",
    [int]$TopK = 5,
    [string]$TopKList = "3,5,8,10",
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
    [string]$SummaryOutput = "c:\src\Wuic\codebase_embeddings\eval_all_sets_summary.json",
    [string]$HistoryPath = "c:\src\Wuic\codebase_embeddings\eval_all_sets_history.jsonl",
    [switch]$SkipExtract,
    [switch]$SkipBuild,
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

function Parse-TopKs {
    param([string]$TopKList, [int]$TopK)
    if ([string]::IsNullOrWhiteSpace($TopKList)) { return @($TopK) }
    $vals = @()
    foreach ($part in ($TopKList -split ",")) {
        $p = ""
        if ($null -ne $part) {
            $p = ([string]$part).Trim()
        }
        if ([string]::IsNullOrWhiteSpace($p)) { continue }
        $n = 0
        if ([int]::TryParse($p, [ref]$n) -and $n -gt 0) { $vals += $n }
    }
    if ($vals.Count -eq 0) { return @($TopK) }
    return ($vals | Sort-Object -Unique)
}

function Load-Json {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    return Get-Content $Path -Raw | ConvertFrom-Json
}

function Load-PreviousRun {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $lines = Get-Content $Path
    if (-not $lines -or $lines.Count -eq 0) { return $null }
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        $line = [string]$lines[$i]
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            return ($line | ConvertFrom-Json)
        }
        catch {
            continue
        }
    }
    return $null
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

if (-not [string]::IsNullOrWhiteSpace($HfToken)) {
    Set-Item -Path ("Env:{0}" -f $HfTokenEnv) -Value $HfToken
}

$topKs = Parse-TopKs -TopKList $TopKList -TopK $TopK
$previous = Load-PreviousRun -Path $HistoryPath

if (-not $SkipExtract) {
    Run-Step -Name "Extract chunks" -Action {
        if ($SkipDb) {
            Invoke-PythonChecked $ExtractScript --root-dir $RootDir --output-jsonl $ChunksJsonl --skip-db
        }
        else {
            Invoke-PythonChecked $ExtractScript --root-dir $RootDir --output-jsonl $ChunksJsonl
        }
    }
}

Ensure-FileExists -Path $ChunksJsonl -Hint "Missing code chunks. Run extract step first."

if (-not $SkipBuild) {
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
}

Ensure-FileExists -Path (Join-Path $IndexDir "vectors.npy") -Hint "Index build did not produce vectors.npy."
Ensure-FileExists -Path (Join-Path $IndexDir "metadata.jsonl") -Hint "Index build did not produce metadata.jsonl."

$evalSets = Get-ChildItem -Path $EvalDir -Filter $EvalPattern -File |
    Where-Object { $_.Name -ne "eval_results_history.jsonl" -and $_.Name -ne "eval_all_sets_history.jsonl" } |
    Sort-Object Name

if (-not $evalSets -or $evalSets.Count -eq 0) {
    throw "No eval sets found in $EvalDir with pattern $EvalPattern"
}

$run = [ordered]@{
    timestamp_utc = [DateTime]::UtcNow.ToString("o")
    embed_model = $EmbedModel
    embed_batch_size = $EmbedBatchSize
    build_resume = (-not [bool]$NoBuildResume)
    top_ks = $topKs
    alpha_vector = $AlphaVector
    alpha_bm25 = $AlphaBm25
    adaptive_alpha = [bool]$AdaptiveAlpha
    alpha_vector_technical = $AlphaVectorTechnical
    alpha_vector_descriptive = $AlphaVectorDescriptive
    rerank_symbol_weight = $RerankSymbolWeight
    rerank_path_weight = $RerankPathWeight
    rerank_text_overlap_weight = $RerankTextOverlapWeight
    sets = @()
    overall = @{}
}

Run-Step -Name "Evaluate all sets" -Action {
    $adaptiveArgs = Build-AdaptiveArgs
    foreach ($set in $evalSets) {
        $setResult = [ordered]@{
            set_name = $set.Name
            eval_file = $set.FullName
            metrics_by_k = @{}
        }
        foreach ($k in $topKs) {
            $safeSetName = [System.IO.Path]::GetFileNameWithoutExtension($set.Name)
            $outPath = Join-Path $EvalDir ("eval_results_{0}_top{1}.json" -f $safeSetName, $k)
            Invoke-PythonChecked $EvalScript --index-dir $IndexDir --eval-file $set.FullName --top-k $k --output-json $outPath --hf-token-env $HfTokenEnv --alpha-vector $AlphaVector --alpha-bm25 $AlphaBm25 @adaptiveArgs
            $m = Load-Json -Path $outPath
            if ($null -eq $m) { throw "Could not parse eval output $outPath" }
            $setResult.metrics_by_k["$k"] = [ordered]@{
                total_cases = [int]$m.total_cases
                hit = [double]$m."hit@$k"
                mrr = [double]$m.mrr
                alpha_vector = [double]$m.alpha_vector
                alpha_bm25 = [double]$m.alpha_bm25
                adaptive_alpha = [bool]$m.adaptive_alpha
                output_json = $outPath
            }
        }
        $run.sets += $setResult
    }
}

# Overall weighted by number of cases for each K.
foreach ($k in $topKs) {
    $sumCases = 0
    $sumHit = 0.0
    $sumMrr = 0.0
    foreach ($s in $run.sets) {
        $mk = $s.metrics_by_k["$k"]
        if ($null -eq $mk) { continue }
        $c = [int]$mk.total_cases
        $sumCases += $c
        $sumHit += ([double]$mk.hit * $c)
        $sumMrr += ([double]$mk.mrr * $c)
    }
    if ($sumCases -gt 0) {
        $run.overall["$k"] = [ordered]@{
            total_cases = $sumCases
            hit = $sumHit / $sumCases
            mrr = $sumMrr / $sumCases
        }
    }
}

# Save summary.
$summaryDir = Split-Path $SummaryOutput -Parent
if ($summaryDir -and -not (Test-Path $summaryDir)) {
    New-Item -ItemType Directory -Path $summaryDir | Out-Null
}
($run | ConvertTo-Json -Depth 12) | Set-Content -Path $SummaryOutput -Encoding UTF8

# Append history.
$historyDir = Split-Path $HistoryPath -Parent
if ($historyDir -and -not (Test-Path $historyDir)) {
    New-Item -ItemType Directory -Path $historyDir | Out-Null
}
($run | ConvertTo-Json -Compress -Depth 12) | Add-Content -Path $HistoryPath -Encoding UTF8

# Console report.
Write-Host ""
Write-Host "=== Per-set results ===" -ForegroundColor Cyan
foreach ($s in $run.sets) {
    Write-Host ("- {0}" -f $s.set_name) -ForegroundColor Yellow
    foreach ($k in $topKs) {
        $mk = $s.metrics_by_k["$k"]
        if ($null -eq $mk) { continue }
        Write-Host ("  top{0}: hit={1:P2} mrr={2:N4} cases={3}" -f $k, $mk.hit, $mk.mrr, $mk.total_cases)
    }
}

Write-Host ""
Write-Host "=== Overall weighted ===" -ForegroundColor Cyan
foreach ($k in $topKs) {
    $ov = $run.overall["$k"]
    if ($null -eq $ov) { continue }
    Write-Host ("top{0}: hit={1:P2} mrr={2:N4} cases={3}" -f $k, $ov.hit, $ov.mrr, $ov.total_cases)
}

if ($null -ne $previous) {
    Write-Host ""
    Write-Host "=== Delta vs previous run (overall) ===" -ForegroundColor Cyan
    foreach ($k in $topKs) {
        $curr = $run.overall["$k"]
        $prev = $previous.overall."$k"
        if ($null -eq $curr -or $null -eq $prev) { continue }
        $dHit = [double]$curr.hit - [double]$prev.hit
        $dMrr = [double]$curr.mrr - [double]$prev.mrr
        Write-Host ("top{0}: hit {1:+0.00%;-0.00%;0.00%} | mrr {2:+0.0000;-0.0000;0.0000}" -f $k, $dHit, $dMrr)
    }
}

Write-Host ""
Write-Host "[done] all eval sets completed." -ForegroundColor Green
Write-Host ("summary: {0}" -f $SummaryOutput)
Write-Host ("history: {0}" -f $HistoryPath)
