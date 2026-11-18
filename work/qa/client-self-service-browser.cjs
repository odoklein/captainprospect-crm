const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { encode } = require("next-auth/jwt");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const ORIGIN = "http://localhost:5011";
const TOKEN = "a".repeat(64);
const proof = path.resolve(__dirname, "../proof/client-self-service");
fs.mkdirSync(proof, { recursive: true });

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const results = [];
    let page;
    const errors = [];
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
        let role = null, invitation = true, invitePath = null;
        let missions = [], signups = [], missionWrites = [];
        let signupStatus = 409;
        const history = { result: "NO_RESPONSE", createdAt: "2026-01-01T10:00:00.000Z", note: "Déjà appelée par un collègue" };
        const queueRow = (id, name, companyOnly = false) => ({
            contactId: companyOnly ? null : id, companyId: "co-" + id,
            contact: companyOnly ? null : { id, firstName: name, lastName: "Contact", phone: "0612345678", status: "ACTIONABLE" },
            company: { id: "co-" + id, name, phone: "0142345678" },
            campaignId: "qa-campaign", channel: "CALL", missionName: "Mission QA", priority: "NEW", hasContactInfo: true,
            lastAction: null, companyLastAction: null, preferredInterlocuteurIds: [], qualification: null,
            hasCompanyHistory: false,
        });
        const queue = [queueRow("fresh", "FreshCo"), { ...queueRow("sibling", "WorkedCo"), companyLastAction: history },
            { ...queueRow("own", "OwnWorkedCo"), lastAction: history, companyLastAction: history }, queueRow("company", "Untouched Company", true)];
        page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.stack || error.message));
        await context.addInitScript(() => sessionStorage.setItem("cp_portal_access_checked", "1"));
        async function auth(nextRole) {
            role = nextRole;
            await context.clearCookies();
            if (!role) return;
            const value = await encode({ secret: "local-self-service-qa-only-2026", token: { id: "qa-user", name: "Alice", email: "alice@acme.test", role, clientId: "qa-client", isActive: true } });
            await context.addCookies([{ name: "next-auth.session-token", value, url: ORIGIN, httpOnly: true, sameSite: "Lax" }]);
        }
        await context.route("**/*", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            // No remote telemetry, email, phone or application service can be called.
            if (url.origin !== ORIGIN) return route.abort();
            if (!url.pathname.startsWith("/api/")) return route.continue();
            const reply = (data, status = 200) => route.fulfill({ status, json: data });
            const success = (data) => reply({ success: true, data });
            if (url.pathname === "/api/auth/session") return reply(role ? { user: { id: "qa-user", name: "Alice", email: "alice@acme.test", role, clientId: "qa-client", isActive: true }, expires: "2099-01-01" } : {});
            if (url.pathname === "/api/auth/providers") return reply({ credentials: { id: "credentials", name: "Credentials", type: "credentials", signinUrl: ORIGIN + "/api/auth/signin/credentials", callbackUrl: ORIGIN + "/api/auth/callback/credentials" } });
            if (url.pathname === "/api/auth/csrf") return reply({ csrfToken: "qa-csrf" });
            if (url.pathname === "/api/auth/callback/credentials") { await auth("CLIENT"); return reply({ url: ORIGIN + "/client/missions?new=1" }); }
            if (url.pathname.startsWith("/api/onboarding/")) {
                if (!invitation) return reply({ success: false, error: "Invitation désactivée" }, 404);
                if (request.method() === "POST") {
                    signups.push(request.postDataJSON());
                    return signupStatus === 201 ? reply({ success: true, data: { redirectTo: "/client/missions?new=1" } }, 201) : reply({ success: false, error: "Impossible de créer ce compte. Essayez de vous connecter ou contactez l’agence." }, signupStatus);
                }
                return success({ available: true });
            }
            if (url.pathname.startsWith("/api/client/missions")) {
                if (request.method() === "GET") return success({ client: { name: "Acme" }, missions });
                const data = request.postDataJSON();
                missionWrites.push({ method: request.method(), data });
                const mission = { ...data, id: "qa-mission", status: "DRAFT", isActive: false, brief: data };
                missions = [mission];
                return success(mission);
            }
            if (url.pathname === "/api/manager/client-invite") {
                if (request.method() === "POST") invitePath = "/onboarding/invite/" + TOKEN;
                if (request.method() === "DELETE") invitePath = null;
                return success({ path: invitePath });
            }
            if (url.pathname.endsWith("/permissions")) return success(["pages.dashboard", "pages.clients", "pages.settings"]);
            if (url.pathname === "/api/notifications") return success({ notifications: [], unreadCount: 0 });
            if (url.pathname === "/api/changelog") return success({ items: [] });
            if (url.pathname === "/api/incoming-calls") return success({ enabled: false, calls: [] });
            if (url.pathname === "/api/portal/meetings/feedback-pending") return success(null);
            if (url.pathname === "/api/manager/home/today") return success(null);
            if (url.pathname === "/api/sdr/missions") return success([{ id: "qa-sdr-mission", name: "Mission QA", channel: "CALL", channels: ["CALL"], client: { id: "qa-client", name: "Acme" } }]);
            if (url.pathname === "/api/sdr/lists") return success([{ id: "qa-list", name: "Liste QA", mission: { id: "qa-sdr-mission", name: "Mission QA" } }]);
            if (url.pathname === "/api/sdr/today-blocks") return success({ todayBlocks: [], todayMissionIds: ["qa-sdr-mission"], weekBlocks: [], hasBlocksToday: true, freeMissionSwitch: true, allowedMissionIds: ["qa-sdr-mission"] });
            if (url.pathname === "/api/sdr/action-queue") return success({ items: queue, paused: null });
            if (url.pathname === "/api/actions/next") return success({ hasNext: false });
            if (url.pathname === "/api/telephony/config") return success({ enabled: false });
            if (url.pathname === "/api/sdr/pace") return success(null);
            if (url.pathname === "/api/leexi/recaps") return success({ matched: [], unmatched: [], totalRecaps: 0, totalMatched: 0 });
            if (url.pathname === "/api/client/access-check") return success({ sessionValid: true, accountActive: true, clientSpace: { name: "Acme" } });
            if (url.pathname === "/api/license-state") return reply({ suspended: false, features: {} });
            return success([]);
        });
        async function screenshot(name, width = 1440) {
            await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
            await page.screenshot({ path: path.join(proof, name + ".png"), fullPage: true });
            const overflow = await page.evaluate(() => ({
                width: innerWidth, scroll: document.documentElement.scrollWidth,
                elements: [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
                    .slice(0, 12).map((element) => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })),
            }));
            assert.ok(overflow.scroll <= overflow.width, `${name}: horizontal overflow ${JSON.stringify(overflow)}`);
        }
        await page.goto(ORIGIN + "/onboarding/invite/" + TOKEN, { waitUntil: "networkidle", timeout: 120000 });
        await page.getByRole("heading", { name: "Créons votre espace" }).waitFor();
        await screenshot("signup-desktop"); await screenshot("signup-mobile", 390);
        await page.getByRole("button", { name: "Créer mon espace client" }).click();
        await page.getByText("Indiquez le nom de votre entreprise.").waitFor();
        assert.equal(signups.length, 0);
        results.push("Signup validates before submitting");
        await page.getByLabel("Entreprise").fill("Acme");
        await page.getByLabel("Votre nom").fill("Alice Martin");
        await page.getByLabel("Email professionnel").fill("alice@acme.test");
        await page.getByLabel("Mot de passe").fill("long test password");
        await page.getByRole("button", { name: "Créer mon espace client" }).click();
        await page.getByRole("alert").filter({ hasText: "Impossible de créer ce compte" }).waitFor();
        assert.equal(signups[0].companyName, "Acme");
        assert.equal(await page.getByLabel("Entreprise").inputValue(), "Acme");
        results.push("Duplicate signup preserves input and shows recovery");

        signupStatus = 201;
        await page.getByRole("button", { name: "Créer mon espace client" }).click();
        await page.waitForURL(/\/client\/missions/, { timeout: 120000 });
        const dialog = page.getByRole("dialog", { name: "Votre nouvelle mission" });
        await dialog.waitFor({ timeout: 30000 });
        await dialog.getByLabel("Nom de la mission").pressSequentially("Prospection DRH");
        assert.equal(await dialog.getByLabel("Nom de la mission").inputValue(), "Prospection DRH");
        await dialog.getByLabel("Quel résultat souhaitez-vous obtenir ?").fill("Obtenir 10 rendez-vous qualifiés");
        await dialog.getByLabel("Date de début souhaitée").fill("2026-12-01");
        await dialog.getByLabel("Date de fin souhaitée").fill("2026-12-31");
        await screenshot("mission-step-one-mobile", 390);
        await dialog.getByRole("button", { name: "Continuer" }).click();
        await dialog.getByLabel("Qui souhaitez-vous toucher ?").fill("DRH des PME de 50 à 200 salariés");
        await dialog.getByLabel("Zone géographique (facultatif)").fill("France");
        await dialog.getByRole("button", { name: "Continuer" }).click();
        await dialog.getByLabel("Ce que vous vendez, en une phrase").fill("Accompagnement et formation RH");
        await screenshot("mission-step-three-mobile", 390);
        await dialog.getByRole("button", { name: "Enregistrer ma mission" }).click();
        await dialog.waitFor({ state: "hidden" });
        await page.getByRole("heading", { name: "Prospection DRH", exact: true }).waitFor();
        assert.equal(missionWrites.length, 1);
        assert.equal(missionWrites[0].data.targetAudience, "DRH des PME de 50 à 200 salariés");
        assert.equal("status" in missionWrites[0].data, false);
        await screenshot("missions-mobile", 390); await screenshot("missions-desktop");
        results.push("Signup signs in and opens the mission questionnaire");
        results.push("Three-step mission brief submits and appears in the workspace");

        await page.getByRole("button", { name: "Compléter mon brief" }).click();
        const edit = page.getByRole("dialog", { name: "Prospection DRH" });
        await edit.getByLabel("Nom de la mission").fill("Prospection DRH — révisée");
        await edit.getByRole("button", { name: "Continuer" }).click();
        assert.equal(await edit.getByLabel("Qui souhaitez-vous toucher ?").inputValue(), "DRH des PME de 50 à 200 salariés");
        await edit.getByRole("button", { name: "Continuer" }).click();
        await edit.getByRole("button", { name: "Enregistrer les modifications" }).click();
        await edit.waitFor({ state: "hidden" });
        assert.equal(missionWrites[1].method, "PATCH");
        results.push("Draft brief reloads and edits through the scoped endpoint");

        missions[0].status = "ACTIVE"; missions[0].isActive = true;
        await page.reload({ waitUntil: "networkidle" });
        await page.getByRole("button", { name: "Consulter la mission" }).click();
        await page.getByText("Pour modifier une mission prise en charge").waitFor();
        assert.equal(await page.getByRole("button", { name: "Enregistrer les modifications" }).count(), 0);
        results.push("Active missions show a read-only brief");

        await auth(null); invitation = false;
        await page.goto(ORIGIN + "/onboarding/invite/" + TOKEN, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: "Invitation indisponible" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Créer mon espace client" }).count(), 0);
        results.push("Revoked invitations cannot show a registration form");

        await auth("MANAGER"); invitation = true;
        await page.goto(ORIGIN + "/manager/clients", { waitUntil: "networkidle", timeout: 120000 });
        await page.getByRole("button", { name: "Inviter un client" }).click();
        const invite = page.getByRole("dialog", { name: "Inviter vos clients" });
        await invite.getByRole("button", { name: "Créer le lien d’invitation" }).click();
        assert.equal(await invite.getByLabel("Lien d’inscription de l’agence").inputValue(), ORIGIN + "/onboarding/invite/" + TOKEN);
        await screenshot("manager-invite-desktop");
        await invite.getByRole("button", { name: "Désactiver ce lien" }).click();
        await invite.getByRole("button", { name: "Créer le lien d’invitation" }).waitFor();
        results.push("Manager creates and disables the reusable agency invitation");

        await invite.getByRole("button", { name: "Fermer", exact: true }).click();
        await page.evaluate(() => { localStorage.setItem("sdr_view_mode", "table"); localStorage.setItem("sdr_selected_mission", "qa-sdr-mission"); });
        await auth("BUSINESS_DEVELOPER");
        await page.goto(ORIGIN + "/sdr/action", { waitUntil: "networkidle", timeout: 120000 });
        const untouched = page.getByRole("button", { name: /^Jamais contactés/ });
        await untouched.waitFor({ timeout: 30000 });
        await untouched.click();
        await page.getByRole("row").filter({ hasText: "Untouched Company" }).waitFor();
        assert.equal(await untouched.getAttribute("aria-pressed"), "true");
        assert.equal(await page.getByRole("row").filter({ hasText: "FreshCo" }).count(), 1);
        assert.equal(await page.getByRole("row").filter({ hasText: "WorkedCo" }).count(), 0);
        await screenshot("sdr-untouched-desktop"); await screenshot("sdr-untouched-mobile", 390);
        await untouched.click();
        await page.getByRole("row").filter({ hasText: "OwnWorkedCo" }).waitFor();
        results.push("SDR quick filter shows untouched contacts and companies, excluding sibling and colleague history");
        assert.deepEqual(errors, [], "Browser runtime errors");
        fs.writeFileSync(path.join(proof, "results.json"), JSON.stringify({ results, browserErrors: errors }, null, 2));
        for (const result of results) console.log("PASS " + result);
    } catch (error) {
        if (page) {
            console.error(JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 5000), browserErrors: errors }));
            await page.screenshot({ path: path.join(proof, "failure.png"), fullPage: true });
        }
        throw error;
    } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
