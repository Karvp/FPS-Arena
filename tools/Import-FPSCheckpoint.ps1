param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [string]$ExpectedSha256 = '',
    [switch]$IncludeReports
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$ZipPath = (Resolve-Path -LiteralPath $ZipPath).Path
$actualSha = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ExpectedSha256 -and $actualSha -ne $ExpectedSha256.ToLowerInvariant()) {
    throw "SHA256 mismatch: expected $ExpectedSha256; got $actualSha"
}
if (Test-Path -LiteralPath (Join-Path $root '.git')) {
    $dirty = & git -C $root status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'git status failed' }
    if ($dirty) { throw 'Working tree not clean. Commit or stash first before checkpoint import.' }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
$staging = Join-Path $root '.checkpoint-stage'
$extracted = 0
$skipped = 0
$guarded = @('page-agent.js','popup.html','manifest.json','background.js','agent-entry.js')
try {
    if (Test-Path $staging) { throw "Staging path exists: $staging" }
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    $entries = @($archive.Entries | Where-Object { $_.Name -ne '' })
    $prefix = ''
    if (@($entries | Where-Object { $_.FullName -match '^FPS-Arena-v[^/]+/lab/arena/' }).Count -gt 0) {
        $first = $entries | Where-Object { $_.FullName -match '^FPS-Arena-v[^/]+/lab/arena/' } | Select-Object -First 1
        $prefix = (($first.FullName -split '/')[0] + '/')
    }
    foreach ($e in $entries) {
        $p = $e.FullName.Replace('\','/')
        if ($prefix) {
            if (!$p.StartsWith($prefix, [StringComparison]::Ordinal)) { throw "Unexpected archive path: $p" }
            $p = $p.Substring($prefix.Length)
        }
        if (!$p -or $p.StartsWith('/') -or $p -match '(^|/)\.\.(?:/|$)' -or $p -match '^[A-Za-z]:') {throw "Unsafe archive path $p"}
        if ($p.StartsWith('.git/') -or $p.StartsWith('.checkpoint-stage/')) {continue}
        if (!$IncludeReports -and $p.StartsWith('reports/')) {$skipped++;continue}
        $target = [IO.Path]::GetFullPath([IO.Path]::Combine($staging, $p.Replace('/', '\')))
        if (!$target.StartsWith($staging + '\',[StringComparison]::OrdinalIgnoreCase)) {throw "Path escaped staging: $p"}
        $folder = [IO.Path]::GetDirectoryName($target)
        if (!(Test-Path $folder)) {[IO.Directory]::CreateDirectory($folder) | Out-Null}
        $s = $e.Open()
        try {
            $dst = [IO.File]::Create($target)
            try {$s.CopyTo($dst)} finally {$dst.Dispose()}
        } finally {$s.Dispose()}
        $extracted++
    }
    foreach ($relative in $guarded) {
        $incoming = Join-Path $staging $relative
        $existing = Join-Path $root $relative
        if ((Test-Path $incoming) -and (Test-Path $existing)) {
            $oldHash = (Get-FileHash $existing -Algorithm SHA256).Hash
            $newHash = (Get-FileHash $incoming -Algorithm SHA256).Hash
            if ($oldHash -ne $newHash) {throw "Protected production file differs: $relative. Manual review required."}
        }
    }
    foreach ($f in Get-ChildItem -LiteralPath $staging -Recurse -File) {
        $rel = $f.FullName.Substring($staging.Length + 1)
        $out = Join-Path $root $rel
        $outDir = [IO.Path]::GetDirectoryName($out)
        if (!(Test-Path $outDir)) {[IO.Directory]::CreateDirectory($outDir) | Out-Null}
        Copy-Item -LiteralPath $f.FullName -Destination $out -Force
    }
    $receipt = @{
        imported_archive = $ZipPath; sha256 = $actualSha
        imported_utc = [DateTime]::UtcNow.ToString('o')
        source_files = $extracted; excluded_reports = $skipped
        include_reports = [bool]$IncludeReports
        status = 'files_imported_tests_and_independent_audit_pending'
    }
    $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'LOCAL_LAST_IMPORT.json') -Encoding UTF8
    Write-Output ("IMPORTED_FILES=" + $extracted)
    Write-Output ("ARCHIVE_SHA256=" + $actualSha)
    Write-Output ("EXCLUDED_REPORTS=" + $skipped)
    Write-Output 'NEXT: run tests; update PROJECT_CONTINUITY.md; commit with Git.'
} finally {
    $archive.Dispose()
    if (Test-Path $staging) {Remove-Item -LiteralPath $staging -Recurse -Force}
}
