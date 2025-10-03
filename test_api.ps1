# Configurações
$apiUrl = "http://localhost:8080/FrontTCC/api/api_ag_receiver.php"
$payloadPath = "C:\Xampp\htdocs\FrontTCC\test_payload.json"
$token = "default_token_secreto"

# Verificar se o payload existe
if (-not (Test-Path $payloadPath)) {
    Write-Host "Arquivo $payloadPath não encontrado. Crie o arquivo test_payload.json com um JSON válido." -ForegroundColor Red
    exit
}

# Ler e exibir o payload
$payload = Get-Content -Path $payloadPath -Raw | ConvertFrom-Json
$body = $payload | ConvertTo-Json -Depth 4
Write-Host "Payload a ser enviado: $body" -ForegroundColor Yellow

# Enviar a requisição POST
try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body $body -ContentType "application/json" -Headers @{ "X-AG-TOKEN" = $token } -ErrorAction Stop
    
    Write-Host "Resposta do servidor:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 4 | Write-Host
} catch {
    Write-Host "Erro ao chamar a API:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Detalhes do erro:" -ForegroundColor Red
        $_.ErrorDetails | ConvertFrom-Json | Write-Host
    } else {
        Write-Host "Nenhum detalhe adicional disponível. Verifique os logs em C:\xampp\php\logs\php_error.log" -ForegroundColor Red
    }
}

# Verificar se o arquivo foi salvo
$storageFile = "C:\xampp\htdocs\FrontTCC\api\storage\ag_latest.json"
if (Test-Path $storageFile) {
    Write-Host "Arquivo salvo em $storageFile" -ForegroundColor Green
    $savedContent = Get-Content -Path $storageFile -Raw | ConvertFrom-Json
    Write-Host "Conteúdo salvo:" -ForegroundColor Green
    $savedContent | ConvertTo-Json -Depth 4 | Write-Host
} else {
    Write-Host "Arquivo não encontrado em $storageFile. Verifique os logs em C:\xampp\php\logs\php_error.log" -ForegroundColor Red
}