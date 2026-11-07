# Local process overrides only. The shared .env file and deployed settings are untouched.
$env:NEXTAUTH_URL = 'http://localhost:5101'
$env:APP_URL = 'http://localhost:5101'
$env:NEXT_PUBLIC_APP_URL = 'http://localhost:5101'
npx next dev -p 5101 -H 127.0.0.1 --webpack
