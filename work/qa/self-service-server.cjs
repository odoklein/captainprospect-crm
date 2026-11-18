// Isolated browser QA: no access to the application's configured database.
process.env.DATABASE_URL = "postgresql://qa:qa@127.0.0.1:9/qa?connect_timeout=1";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.NEXTAUTH_SECRET = "local-self-service-qa-only-2026";
process.env.NEXTAUTH_URL = "http://localhost:5011";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:5011";

const http = require("node:http");
const next = require("next");
const app = next({ dev: true, hostname: "localhost", port: 5011, webpack: true, conf: { distDir: ".next-self-service-qa" } });
app.prepare().then(() => {
    http.createServer(app.getRequestHandler()).listen(5011, "127.0.0.1", () => console.log("Isolated QA: http://localhost:5011"));
}).catch((error) => { console.error(error); process.exitCode = 1; });
