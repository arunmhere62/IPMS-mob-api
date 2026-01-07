$envPath = "d:\pg-mobile-app\IPMS-mob\IPMS-mob-api\.env"

if (-not (Test-Path $envPath)) {
    Write-Host "Error: .env file not found"
    exit 1
}

$content = Get-Content $envPath -Raw
$base64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))

Write-Host ""
Write-Host "BASE64 ENCODED VALUE:"
Write-Host ""
Write-Host $base64
Write-Host ""
Write-Host "Value copied to clipboard!"

Set-Clipboard -Value $base64
