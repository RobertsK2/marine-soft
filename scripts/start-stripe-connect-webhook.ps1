$ErrorActionPreference = 'Stop'

if (-not (Get-Command stripe.cmd -ErrorAction SilentlyContinue)) {
  Write-Error 'Stripe CLI is not installed or is not available on PATH.'
}

$endpoint = 'http://localhost:3000/api/stripe/connect/webhook'
$events = 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired'

Write-Host 'Starting the Stripe CLI listener for platform and connected-account Checkout events.'
Write-Host 'Copy the whsec_ signing secret shown by Stripe into .env.local, then restart the app.'
Write-Host 'Do not paste the secret into source files, chat, screenshots, or committed documentation.'

& stripe.cmd listen --events $events --forward-to $endpoint --forward-connect-to $endpoint
if ($LASTEXITCODE -ne 0) {
  throw "Stripe CLI listener exited with code $LASTEXITCODE. Run 'stripe login' and try again."
}
