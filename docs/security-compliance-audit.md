# Säkerhets- och regelefterlevnadsgranskning – Syncmemos

> **Lanseringsbeslut: `STOPP`**
> De bekräftade kritiska kodbristerna är åtgärdade i arbetskopian, men ändringarna är inte produktionsverifierade. Nykundsregistrering och betalningar ska förbli stängda tills migrering, ny Recall-hemlighet, policypublicering, logg-/incidentbedömning och de externa leverantörs- och driftkontrollerna nedan är verifierade.

## 1. Granskningsuppgifter

| Uppgift | Värde |
|---|---|
| Granskningsdatum | 2026-08-24 |
| Granskat Git-commit | `516bfc0ee2bf485c00ee06c85dc686a5a3f1b0e5` (`origin/main` vid branchskapandet) |
| Åtgärdsrevision | Arbetskopia på `fix/security-compliance-hardening`; rapporten länkar till aktuell branch |
| Kodmiljö | Node.js 20-monorepo; Express-API, Next.js-webb och PostgreSQL/Drizzle |
| Produktionsmål | [www.syncmemos.com](https://www.syncmemos.com) och [api.syncmemos.com](https://api.syncmemos.com) |
| Avsedd marknad | B2B inom EU; servern kräver nu organisation, B2B-bekräftelse och versionsstyrda villkor, men uppgifterna är självdeklarerade och avtals-/säljarunderlag saknas |
| Säkerhetsreferenser | [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) och [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x03-introduction/) |
| Metod | Statisk kodgranskning, tester, typkontroll, lint, bygg, beroende- och hemlighetssökning samt passiva/säkra HTTP-, TLS- och DNS-kontroller |
| Externa dashboards | Ingen autentiserad skrivskyddad åtkomst fanns; berörda kontroller är märkta `Ej verifierad` |

### Omfattning och begränsningar

Granskningen omfattar den versionshanterade kodbasen, dokumentationen och publikt observerbara produktionsytor vid tidpunkten ovan. Ingen brute force, DoS, exploit mot riktiga konton, dataradering eller annan aktiv påverkan utfördes. Inget riktigt användarkonto skapades och inga kunddata öppnades. Railway, Vercel, Cloudflare, Supabase, Recall, AssemblyAI, Google, Anthropic, Resend, Sentry och Paddle kunde inte granskas bakom inloggning.

Nuvarande versionshanterade filer har genomsökts med ett lokalt högsignalsverktyg, men hela Git-historiken, byggartefakter, containerlager och produktionsloggar kunde inte läsas. Åtgärderna har verifierats lokalt, inte efter driftsättning. Avsaknad av ett fynd är därför inte ett bevis på att en kontroll är säker. Rapporten är teknisk och operativ vägledning, inte juridisk rådgivning. Frågor märkta **Juristbedömning krävs** ska avgöras av svensk jurist eller dataskyddsexpert.

Ingen granskning kan garantera att en tjänst aldrig blir hackad.

## 2. Ledningssammanfattning

Den kritiska loggningsbristen är åtgärdad i kod med allowlistad request-serialisering och full redigering av querydelen. OAuth-`state`, signerad Recall-live-webhook med fem minuters färskhetsfönster, tidsbegränsade opt-in-delningar, Google-kontoradering, fail-closed provider-radering, gallring av behandlade webhook-payloads och misslyckade ljudfiler, Paddle-anonymisering, filsignaturkontroll, serverlagrad inspelningsbekräftelse, B2B-/villkorsevidens, AI-datagränser, webbsäkerhetsrubriker och CI-härdning är också implementerade och testade.

Lanseringen är ändå stoppad. Historiska produktionsloggar måste bedömas och eventuellt saneras; sessioner och tidigare URL-hemligheter måste roteras efter dokumenterad incidentbedömning. De nya databasmigreringarna måste köras och en separat `RECALL_REALTIME_WEBHOOK_SECRET` konfigureras. Registrering är nu fail-closed tills policyerna är publicerade, men juridisk säljare, avtal, inspelningsansvar, DPIA/RoPA/DSR-/incidentrutiner samt DPA, region, gallring och överföringsmekanismer för leverantörerna saknar verifierbart underlag.

Lokalt passerar 851 tester, typkontroll, lint och båda produktionsbyggena. `npm audit --omit=dev` visar noll sårbarheter; full audit visar fyra moderata, endast i utvecklingskedjan, och inga höga eller kritiska. Dessa resultat gäller arbetskopian och ersätter inte produktions- eller avtalsverifiering.

## 3. System-, data- och hotkarta

### Dataflöden och förtroendegränser

```text
Besökare/användare
  ├─ Cloudflare → Vercel/Next.js (publik webb, konto, pris, delningssida)
  └─ Railway/Express API (sessionskaka, konton, möten, billing)
       ├─ Supabase PostgreSQL + privat ljudlagring
       ├─ Recall (mötesbot, inspelning och live-webhooks)
       ├─ AssemblyAI (uppladdad ljudtranskribering)
       ├─ Anthropic / Google Gemini (sammanfattning, chatt och dokument)
       ├─ Resend (verifieringsmejl)
       ├─ Sentry (feltelemetri)
       └─ Paddle (checkout, kund- och abonnemangsstatus, webhooks)
```

De viktigaste skyddsvärda tillgångarna är sessionsvärden, Google-identiteter, e-postadresser, möteslänkar, ljud, transkript, deltagarnamn, AI-resultat, delningstoken, kund-/abonnemangsuppgifter, webhook-hemligheter, leverantörsnycklar, revisionsloggar och raderingsbevis. De viktigaste hotaktörerna är en oautentiserad angripare, en komprometterad användare, en mötesdeltagare som injicerar instruktioner i transkriptet, en felkonfigurerad eller komprometterad leverantör, en person med loggåtkomst och en komprometterad byggkedja.

### Inventerade API-ytor

| Område | Inventerade rutter |
|---|---|
| Autentisering | signup, login, logout, me, byte av lösenord/e-post, kontoradering, Google OAuth + callback, verifiering och nytt verifieringsmejl |
| Möten | skapa, lista, hämta, transkript, live-SSE, live-dokument, dokumentgenerering, publik delning och ljuduppladdning |
| AI | möteschatt, sammanfattning och catch-up-dokument |
| Abonnemang | usage, subscription, billing context, checkout, portal, preview/change plan |
| Webhooks | Recall, Recall live, AssemblyAI, Paddle och intern uppladdningshändelse |
| Drift | health endpoint och worker/sweep-jobb |

### Inventerade webbsidor

Landningssida, registrering, inloggning, e-postverifiering, möteslista, mötesdetalj, prissida, inställningar, checkout-resultat, publik delning `/s/[token]` samt engelska/svenska policy-rutter inventerades. I produktion returnerade policy-rutterna 404 trots att registreringen var öppen.

### Inventerade datatyper

| Klass | Exempel |
|---|---|
| Konto och identitet | e-post, lösenordshash, Google-ID, verifieringsstatus, sessioner |
| Mötesinnehåll | mötes-URL, deltagarnamn, ljudsökväg, bot-ID, transkript, live-segment, sammanfattning och AI-dokument |
| Delning | slumpgenererad share-token, opt-in-status, utgångstid och minimerad offentlig mötesrepresentation |
| Drift och säkerhet | webhook-payload, försök/status, e-postledger, request-ID, feltext |
| Fakturering | Paddle customer-ID, transaction/subscription-ID, e-post, plan, status och schemalagd ändring |

## 4. Samlad fyndlista

Status betyder: `Åtgärdad i kod` när regressionstest visar att arbetskopian stänger fyndet men produktion ännu inte verifierats; `Delvis åtgärdad` när risken minskats men restarbete finns; `Öppen` när bristen kvarstår; och `Ej verifierad` när nödvändig extern evidens saknas. Allvarligheten beskriver fyndets ursprungliga påverkan, inte att en åtgärdad kontroll fortfarande är exploaterbar i arbetskopian.

| ID | Kategori | Allvarlighet | Status | Bevis | Påverkan | Rekommenderad åtgärd | Ansvarig | Verifieringsmetod |
|---|---|---:|---|---|---|---|---|---|
| SEC-001 | Loggning/hemligheter | **Kritisk** | Åtgärdad i kod; incidentbedömning krävs | [server.ts L19](../apps/api/src/adapters/http/server.ts#L19) redigerar hela querydelen och allowlistar requestfält; [regressionstest](../apps/api/src/adapters/http/request-logging.test.ts) visar att syntetiska hemligheter inte skrivs | Tidigare produktion kan ha loggat sessioner eller webhookvärden | Driftsätt, inventera/sanera loggsänkor, bedöm incident och rotera sessioner/hemligheter | Säkerhets-/driftansvarig | Canarytest i produktion utan verkliga hemligheter + loggåtkomstgranskning |
| SEC-002 | OAuth | **Hög** | Åtgärdad i kod | 256-bitars HttpOnly-state skapas i [cookies.ts L63](../apps/api/src/adapters/http/cookies.ts#L63), skickas och konsumeras före kodutbyte i [auth.routes.ts L204](../apps/api/src/adapters/http/routes/auth.routes.ts#L204) | Login-CSRF/kontoförväxling om gammal version ligger kvar | Driftsätt och verifiera att redirect innehåller state och felaktig callback nekas | Backendansvarig | Negativa callback-tester + passiv produktionsredirect |
| SEC-003 | Publik delning | **Hög** | Åtgärdad i kod; migrering krävs | [meeting.repository.ts L60](../apps/api/src/adapters/db/repositories/meeting.repository.ts#L60) kräver aktiv och icke utgången delning; [meetings.routes.ts L85](../apps/api/src/adapters/http/routes/meetings.routes.ts#L85) ger ägarbunden create/revoke; metadata är generisk och `noindex` | Gamla permanenta länkar är risk tills migration/deploy | Kör migration 0010, driftsätt och verifiera expiry/revoke/no-store/noindex | Backend/webb/drift | API-, repo- och header-/unfurltest i staging/produktion |
| SEC-004 | Webhook-hemlighet | **Hög** | Åtgärdad i kod; rotation/config krävs | Recall-URL saknar nu token i [recall.adapter.ts L163](../apps/api/src/adapters/recall/recall.adapter.ts#L163); [webhooks.routes.ts L35](../apps/api/src/adapters/http/routes/webhooks.routes.ts#L35) kräver signerad rå body | Gammal URL-token kan finnas i loggar; fel config stoppar liveflöde | Skapa separat hemlighet, konfigurera Recall/Railway och rotera gammalt värde | Backend/drift | Signerade/ogiltiga/för gamla webhooktest + loggkontroll |
| SEC-005 | Filuppladdning/resursbruk | **Hög** | Delvis åtgärdad | Standardgräns 50 MB och en samtidig heapbuffer i [env.ts L60](../apps/api/src/config/env.ts#L60); allowlist och containersignatur i [upload-inputs.ts L66](../apps/api/src/adapters/http/routes/upload-inputs.ts#L66); orphan cleanup vid persistensfel | Buffering är fortfarande per process och multi-replica-/stagingbelastning saknas | Strömma till isolerad lagring och verifiera global samtidighetskvot | Backend/drift | Negativt filkorpus och kontrollerat stagingbelastningstest |
| SEC-006 | Rate limiting | Medel | Öppen | [rate-limit.ts](../apps/api/src/adapters/http/middleware/rate-limit.ts) håller fixed-window-tillstånd i processminne | Omstart/flera repliker kan kringgå konto-, kostnads- och missbruksgränser | Delad atomisk store, dokumenterad proxykedja och multi-replica-tester | Backend/drift | Två-replika-staging och restart-test |
| SEC-007 | Webhook replay | Medel | Åtgärdad i kod | [recall-webhook.verifier.ts](../apps/api/src/adapters/recall/recall-webhook.verifier.ts) kräver timestamp inom fem minuter och verifierar konstant-tidssignatur | Klockfel/providerretry över fönstret kan ge avvisning | Övervaka 401 och dokumentera klocksynk/retry | Backend/drift | Tester med gammal, framtida, ändrad och korrekt signerad händelse |
| SEC-008 | Webbrubriker | Medel | Delvis åtgärdad | [next.config.ts L34](../apps/web/next.config.ts#L34) sätter CSP, no-referrer, Permissions-Policy, COOP, HSTS, nosniff och stänger powered-by | CSP tillåter fortfarande `unsafe-inline`; produktion inte verifierad | Inför nonce/hash där möjligt och kör header-/Paddle-regression efter deploy | Webansvarig | Automatiserat header- och checkouttest på alla sidtyper |
| SEC-009 | Sessions-/kontoskydd | Medel | Öppen | Session kan konfigureras upp till 90 dagar i [env.ts](../apps/api/src/config/env.ts); ingen MFA, idle timeout eller sessionsvy | Stulen cookie kan ha lång användbarhet, särskilt för känsligt mötesinnehåll | Kortare default, MFA/passkeys, idle/absolute timeout, sessionsvy och riskbaserad reautentisering | Produkt/backend | Konto- och sessionspenetrationstest |
| SEC-010 | Resurskontroller | Medel | Delvis åtgärdad | Numeriska env-värden har nu rimliga min/max och negativa tester i [env.ts](../apps/api/src/config/env.ts); SSE saknar fortfarande global/per-user samtidighetsgräns | Autentiserad användare kan skapa många långlivade anslutningar | Delad/global anslutningskvot, timeout och backpressure | Backend/drift | Multi-replica stagingbelastning |
| SEC-011 | AI prompt injection | Medel | Delvis åtgärdad | Claude/Gemini avgränsar nu escaped data som `untrusted_transcript`, förbjuder instruktioner/dataexfiltration; [DocumentView.tsx L26](../apps/web/src/components/DocumentView.tsx#L26) kräver mänsklig kontroll | Prompt injection och felaktiga AI-resultat kan inte elimineras med prompttext | Bygg systematiskt evalkorpus, kvalitetsgränser och incidentprocess | AI-/produktansvarig | Prompt-injection-/exfiltrations-/hallucinationsevals på alla funktioner |
| SEC-012 | Kontoåterställning | Medel | Ej verifierad | Ingen självbetjänad password-reset; stödmejl används | Otydlig identitetskontroll kan ge kontoövertagande eller lång låsning | Dokumentera säker återställning eller bygg verifierad tokenbaserad reset | Säkerhets-/supportansvarig | Runbook-test med social-engineering-scenarier |
| SEC-013 | Informations-/sårbarhetsyta | Låg | Öppen | `/.well-known/security.txt` saknas; health visar exakt commit; viss infrastrukturinformation exponeras | Försvårad ansvarsfull rapportering och mindre informationsläckage | Publicera security.txt och minimera onödig versions-/providerinformation | Drift | Publik HTTP-kontroll |
| PRIV-001 | Registrerades rättigheter | **Hög** | Åtgärdad i kod; starkare reauth rekommenderas | [auth.service.ts L256](../apps/api/src/application/auth.service.ts#L256) stödjer password- och Google-only-konton; Google kräver exakt destruktionsfras och aktiv session | Stulen aktiv Google-session kan använda frasen utan färsk Google-reauth | Driftsätt; komplettera med färsk OAuth- eller e-postreauth | Backend/dataskydd | End-to-end med OAuth-only- och passwordkonto |
| PRIV-002 | Radering | **Hög** | Delvis åtgärdad | [auth.service.ts L268](../apps/api/src/application/auth.service.ts#L268) raderar extern media först och stoppar lokalt borttag vid leverantörsfel | Manuell retry krävs; durable outbox/dead-letter och providerbevis saknas | Lägg durable raderingsjobb, larm, avstämning och deletion receipt | Backend/drift | Felinjicering, retry och dashboard-/leverantörsbevis |
| PRIV-003 | Gallring/webhooks | **Hög** | Delvis åtgärdad | [webhook-event.repository.ts L59](../apps/api/src/adapters/db/repositories/webhook-event.repository.ts#L59) ersätter behandlad payload med `{redacted:true}` | Gamla rader och permanent misslyckade events kan innehålla personuppgifter; DSR-koppling saknas | Backfill/rensa historik, retention för failed/dead events och DSR-index | Backend/dataskydd | Seedad PII-payload, historikrensning och DSR-test |
| PRIV-004 | Gallring/ljud | **Hög** | Åtgärdad i kod; lagringsinventering krävs | [sweep.ts L91](../apps/api/src/jobs/sweep.ts#L91) raderar ljud för terminalt misslyckade möten efter en timme; uploadstädning körs även vid DB/outboxfel | Befintliga orphan-objekt och providerretention är ej verifierade | Driftsätt, inventera bucket/provider och lägg återkommande orphan reconciliation | Backend/drift | Feltest + read-only lagringsinventering efter SLA |
| PRIV-005 | Kontoradering/billing | **Hög** | Åtgärdad i kod; historik kräver kontroll | [paddle-billing.repository.ts L7](../apps/api/src/adapters/db/repositories/paddle-billing.repository.ts#L7) nollställer lokal e-post och användarlänk före kontoborttag | Äldre rader/providerdata kan omfattas av annan retention | Backfill policy, dokumentera bokföringsgrund och verifiera Paddle-radering/retention | Backend/ekonomi/dataskydd | End-to-end-radering och databas/dashboardfråga |
| PRIV-006 | Transparens/gallring | **Hög** | Åtgärdad i kod; retentionbevis krävs | Det ovillkorliga raderingslöftet har tagits bort från [pricing/page.tsx L51](../apps/web/src/app/pricing/page.tsx#L51); lokala felvägar är härdade men provider-/backupradering är ej verifierad | Felaktig förväntan kan återkomma om nytt löfte publiceras utan underlag | Publicera exakt retention per datatyp/provider först efter verifiering | Produkt/juridik | Krav-till-kod-matris, innehållsgranskning och leverantörsbevis |
| PRIV-007 | Personuppgiftsbiträden/överföring | **Hög** | Ej verifierad | [data-processors.md](data-processors.md) saknar signerade DPA-, region-, underbiträdes-, backup-, retention- och överföringsbevis för samtliga providers | Otillräckligt stöd för GDPR art. 28 och kapitel V | Samla avtal, SCC/annan mekanism, TIA, region, retention/radering och instruktioner per provider | Dataskydd/juridik | Dokumentgranskning + skrivskyddade dashboardexporter |
| PRIV-008 | GDPR-styrning | **Hög** | Ej verifierad | Ingen godkänd DPIA, RoPA, DSR/export-runbook, incidentplan, ansvarsmatris eller genomförd raderingsövning kunde visas | Rättigheter, 72-timmarsbedömning och hög-riskbehandling kan hanteras för sent/fel | Fastställ roller, RoPA, DPIA-screening/DPIA, DSR- och incidentrunbooks samt övningar | Dataskydd/ledning | Signerade dokument och tabletop/DSR-övning |
| PRIV-009 | Cookies/terminalåtkomst | Medel | Ej verifierad | Nödvändig sessioncookie finns; full inventering av Paddle/Cloudflare/övrig runtime-lagring saknas | Icke-nödvändig lagring kan användas utan korrekt information/samtycke | Cookie-/SDK-inventering per sida och ändamål; CMP endast om något kräver samtycke | Webb/juridik | Ren webbläsarprofil före/efter val och blockeringsprov |
| LEG-001 | Integritetsinformation | **Hög** | Åtgärdad fail-closed i kod; innehåll/config krävs | Produktion startar inte med öppen registrering utan publiceringsflagga och versionsdatum i [env.ts L96](../apps/api/src/config/env.ts#L96); signupservern nekar när stängd | Nuvarande produktion kan ligga på gammal version; juridiskt innehåll/säljare ej godkänt | Färdigställ juridik, publicera policyer, sätt samma flaggor/version i API och webb och smoke-testa | Juridik/dataskydd/produkt | Incognito- och direkt-API-test från signup till versionsstyrd policy |
| LEG-002 | B2B-/konsumentavgränsning | **Hög** | Delvis åtgärdad | [auth.routes.ts L35](../apps/api/src/adapters/http/routes/auth.routes.ts#L35) kräver organisation och B2B-bekräftelse; tid/villkorsversion lagras; nya Google-konton blockeras | Självdeklaration bevisar inte näringsidkare/behörighet och äldre konton har ingen obligatorisk reaccept | Verifiera organisation/behörighet, re-gata legacykonton eller bygg full B2C-efterlevnad | Produkt/juridik | Privat e-post, falsk organisation, legacykonto, checkout och avtals-/kundklassning |
| LEG-003 | Avtal/inspelning | **Hög** | Åtgärdad i kod; migrering/juridisk text krävs | [meetings.routes.ts](../apps/api/src/adapters/http/routes/meetings.routes.ts) och upload-gaten kräver aktuell bekräftelse; servern lagrar tid/version per möte via [schema.ts](../apps/api/src/adapters/db/schema.ts) | Bekräftelsen bevisar en affirmation men inte att faktisk deltagarinformation eller rättslig grund fanns | Kör migration 0012, juridiskt granska notice-texten och verifiera revisionsutdrag | Produkt/backend/juridik | Direkt-API-negativtest för bot/upload + DB-utdrag |
| LEG-004 | Säljar-/avtalsinformation | **Hög** | Öppen | Policy-publicering kräver env-flaggor i [legal.ts L25](../apps/web/src/lib/legal.ts#L25); [legal-seller-readiness.md](legal-seller-readiness.md) visar obesvarad juridisk säljare/adress/granskning | E-handels- och avtalsinformation kan inte lämnas korrekt; avtalspart oklar | Fastställ säljare, adress, e-post, registrering/VAT, priser/skatter och godkända villkor | Ledning/juridik/ekonomi | Bolagsbevis, skatte-/VAT-underlag och publicerad information |
| LEG-005 | Mötesinspelning/roller | **Hög** | Ej verifierad | Produkten kan skicka bot eller spela in lokalt men saknar visat kund-DPA, instruktion, deltagarinformation och rättslig roll-/ansvarsmodell | Olaglig/otillåten inspelning eller behandling i arbetslivet/känsliga möten | **Juristbedömning krävs:** definiera kund/Syncmemos-roller, tillåtna användningar, notice-mall och hantering av art. 9-data | Juridik/dataskydd/produkt | Avtalsgranskning och scenariobaserad DPIA |
| LEG-006 | EU AI-förordningen | Medel | Delvis åtgärdad | UI märker dokument som AI-genererade och kräver mänsklig kontroll, men ingen klassificeringspromemoria, AI-kompetensplan, providerinstruktion eller utvärdering kunde visas | Bristande artikel 4/50-styrning och otydligt ansvar för AI-resultat | Klassificera varje use case/roll, utbilda personal, dokumentera transparens, human review och providerdata | AI-/juridikansvarig | Signerad AI Act-matris, utbildningsbevis och UI-test |
| LEG-007 | Övrig lagtillämplighet | Medel | Ej verifierad | Entitetsstorlek, konsumentförsäljning och sektorunderlag saknas | Tillgänglighetslagen, konsumentregler eller cybersäkerhetslagen kan felaktigt avfärdas | **Juristbedömning krävs:** dokumentera applicability för varje regel och ompröva vid ändring | Ledning/juridik | Årlig signerad applicability review |
| OPS-001 | CI/leverantörskedja | **Hög** | Åtgärdad i kod; GitHub-inställning ej verifierad | [ci.yml L13](../.github/workflows/ci.yml#L13) har läsbehörighet; actions är SHA-pinnade, Railway CLI `5.30.1`, token endast på tre deploysteg och environment `production` | Environment approvals/RBAC och faktisk tokenräckvidd är inte verifierade | Aktivera branch-/environment-skydd, reviewers och minsta Railway-scope | DevOps/säkerhet | Workflow review + skrivskyddad GitHub/Railway-kontroll |
| OPS-002 | Produktionsstyrning | **Hög** | Ej verifierad | Ingen dashboardevidens för RBAC/MFA, prod/dev-separation, WAF, loggretention/scrubbing, nyckelrotation, backup/PITR, restore eller larm | Okänd sannolikhet för stor incident och okänd återställningsförmåga | Exportera inställningar, minst privilegium, central loggpolicy, restore-test och incidentlarm | Drift/säkerhet | Skrivskyddad kontroll + dokumenterad restore/tabletop |
| OPS-003 | E-postdomän | Medel | Öppen | DMARC är `p=none`; aggregate-rapport skickas till personlig Gmail-adress (adressen utelämnas här); SPF finns, DKIM ej verifierad | Svagare spoofingskydd och olämplig personbunden säkerhetskanal | Flytta rapportadress till styrd funktionsbrevlåda, verifiera DKIM och stega DMARC till reject | Drift/säkerhet | DNS-fråga och DMARC-rapportanalys |
| OPS-004 | DNS | Låg | Öppen | Ingen DNSKEY observerades för zonen | DNS-svar saknar DNSSEC-valideringskedja | Aktivera DNSSEC hos Cloudflare/registrar med rollbackplan | Drift | `DNSKEY`/DS-validering från flera resolvers |
| OPS-005 | Driftinformation | Låg | Öppen | Footer visar statiskt ”All systems operational”; ingen publik statuskoppling verifierad | Besökare kan få felaktig driftinformation | Koppla till verklig status/incidentprocess eller ta bort påståendet | Produkt/drift | Simulerad incident i staging/statusflöde |
| DEP-001 | Beroenden | Medel | Öppen, accepterad tillfälligt | Full `npm audit` gav fyra moderata dev-sårbarheter i `drizzle-kit` → äldre `esbuild`; produktion `--omit=dev` gav 0 | Devserver/verktyg kan exponeras om de körs mot opålitligt innehåll | Uppgradera kontrollerat efter kompatibilitetstest; kör aldrig devserver externt | Tech lead | Ny audit, regressionstest och bygg |
| OPS-006 | Historiska hemligheter | Medel | Delvis åtgärdad | [secret-scan.mjs](../scripts/secret-scan.mjs) söker versionshanterade och icke ignorerade arbetskopiefiler utan att skriva matchvärden; 357 filer gav inga träffar | Git-historik, images, artifacts och loggar är fortfarande ej verifierade | Kör Gitleaks/likvärdigt över historik och externa lagringsytor; rotera träffar | Säkerhet/DevOps | Signerad scanrapport utan hemlighetsvärden |

## 5. Säkerhetsfynd

### Kritisk loggning – kod stängd, produktionsefterarbete öppet

Requestloggen allowlistar nu request-ID, metod, sanerad sökväg och IP; headers, body samt querynamn och queryvärden serialiseras inte. Regressionstestet matar in syntetiska cookie-, OAuth- och webhookvärden och verifierar att inget värde förekommer i loggutdata. Providerfel loggas utan authorization code eller rått providersvar.

Det går däremot inte att fastställa här om den gamla versionen redan skrivit verkliga värden i Railway, Sentry, Cloudflare, supportexporter eller andra loggsänkor. Därför kvarstår lanseringsstoppet tills organisationen har:

1. identifierat alla loggsänkor, åtkomsthistorik, retention, exporter och supportkopior;
2. dokumenterat en GDPR artikel 33-bedömning och starttid för 72-timmarsfristen om en personuppgiftsincident konstateras;
3. roterat/revokerat aktiva sessioner och tidigare query-/webhookhemligheter som kan ha exponerats;
4. driftsatt den sanerade loggern och verifierat den med ofarliga canaryvärden;
5. säkrat eller gallrat gamla loggar i enlighet med incident- och bevarandekrav.

### Implementerade säkerhetskontroller

- Google OAuth använder en 256-bitars, HttpOnly, SameSite Lax, tio minuter gammal högst och engångskonsumerad `state`; felaktig eller saknad state avvisas före kodutbyte.
- Publik delning är explicit opt-in, roterar token vid aktivering, har högst sju dagars livslängd (UI-standard 24 timmar), kan återkallas av ägaren och svarar med no-store/noindex och innehållsfri metadata.
- Recall-live-endpointen innehåller inte längre hemlighet i URL. Inkommande rå body verifieras med leverantörens signaturheaders och fem minuters färskhetsfönster.
- Upload accepterar endast en allowlist av ljudtyper vars containersignatur matchar, har 50 MB standardgräns, en samtidig buffer per process och städar lagring om DB/outboxpersistens misslyckas.
- Claude och Gemini behandlar escaped transkript som otillförlitlig data, förbjuder transkriptinstruktioner att ändra uppgiften eller exfiltrera data, och UI markerar AI-resultat för mänsklig kontroll.
- Webben sätter CSP, Referrer-Policy, Permissions-Policy, COOP, HSTS, nosniff och frame-skydd samt döljer powered-by.

### Öppna säkerhetsrisker

- Filuppladdningen buffras fortfarande i applikationsminne; processlokal samtidighetsgräns ersätter inte streaming eller global/multi-replica-kvot.
- Rate limiting och vissa SSE-gränser är processlokala. En omstart eller flera repliker kan kringgå dem.
- CSP behöver på sikt nonce/hash för att ta bort `unsafe-inline`, och checkout måste regressionstestas efter skärpning.
- MFA/passkeys, sessionsvy, idle timeout och självbetjänad verifierad kontoåterställning saknas.
- Prompt injection och felaktiga AI-resultat kan reduceras men inte elimineras; systematiska evals saknas.

## 6. Integritet och GDPR

### Roller och rättslig grund

Den mest sannolika modellen är att kunden är personuppgiftsansvarig och Syncmemos biträde för mötesinnehåll, medan Syncmemos är självständigt ansvarig för konto-, säkerhets-, kommunikations- och viss faktureringsbehandling. Detta är en preliminär teknisk bedömning. **Juristbedömning krävs**, och modellen måste stämma med verklig bestämmanderätt, avtal och providerflöden.

Rättslig grund får inte reduceras till en generell inspelningscheckbox. Kundens grund kan variera mellan avtal, intresseavvägning, rättslig förpliktelse och i vissa sammanhang samtycke. Känsliga personuppgifter enligt artikel 9 kräver dessutom ett tillämpligt undantag. Arbetsplatsinspelningar kan medföra maktobalans och hög risk.

### Radering, gallring och rättigheter

Google-only-konton kan nu radera sig med aktiv session och en explicit destruktionsfras; lösenordskonton reautentiseras med lösenord. Extern storage/Recall-media raderas före lokala referenser och hela raderingen stoppar med 503 om någon leverantörsradering misslyckas. Behandlade webhook-payloads ersätts med en redigerad markör, terminalt misslyckade uploads städas efter en timme och den lokala Paddle-spegelns e-post/användarlänk anonymiseras.

Kvarstående gap är att Google-radering inte kräver färsk OAuth-reauth, externa raderingsfel saknar durable outbox/dead-letter och deletion receipt, historiska/failed webhook-payloads behöver backfill/retention, och befintliga orphan-objekt/backups/providers inte har inventerats. Bokförings- eller providerkrav hos Paddle innebär inte automatiskt att Syncmemos lokala spegel får sparas identifierbart. Varje datatyp behöver ägare, ändamål, rättslig grund, lagringstid, backupbeteende och verifieringsbevis.

### Nödvändig styrning

Före lansering behövs minst:

- behandlingsregister/RoPA enligt artikel 30 och en tydlig ansvarsmatris;
- DPIA-screening och sannolikt en full konsekvensbedömning för arbetslivsinspelning, känsliga möten, AI-bearbetning och leverantörskedjan;
- biträdesavtal med kunder och artikel 28-villkor med underbiträden;
- tredjelandsmekanism, SCC där relevant, transfer impact assessment och dokumenterade regioner;
- DSR-runbook för tillgång, rättelse, export, radering, begränsning och invändning;
- incidentrunbook med beslutsklocka, bevisbevarande, 72-timmarsbedömning och kommunikation;
- verifierade retention- och raderingsövningar, inklusive backups och providerdata.

## 7. Övrig juridik

### Bedömning per regelverk

| Regelverk | Bedömning 2026-08-24 | Huvudgap |
|---|---|---|
| GDPR + svensk kompletteringslag | Tillämpligt | Registrering är fail-closed i arbetskopian, men art. 13-innehåll, DPA/överföring, full gallring/rättigheter, DPIA och incidentbevis saknas |
| Inspelning och svensk straffrätt | **Juristbedömning krävs** | Botens deltagarstatus, kundens mandat, deltagarinformation, arbetsrätt och art. 9-situationer är inte fastställda |
| EU AI Act | Tillämplighet per roll/funktion måste dokumenteras; mötessammanfattning ser inte i sig ut som Annex III-högrisk | UI-transparens är införd; AI-kompetens, klassificering, leverantörsinstruktion och systematisk kvalitets-/riskutvärdering saknas |
| E-handelslagen | Tillämplig även i B2B på central säljarinformation | Juridisk identitet, adress, direkt e-post, pris-/skatte- och avtalsinformation är inte publicerad/verifierad |
| Marknadsföringslagen | Tillämplig | Det obestyrkta raderingspåståendet är borttaget; nya säkerhets-/retentionspåståenden måste ha verifierbart underlag |
| LEK/cookies | Nödvändig sessioncookie ser undantagen ut; full runtime-inventering saknas | Paddle/Cloudflare/övriga SDK-cookies och lagring är inte verifierade |
| Distansavtal/konsumenträtt | Villkorligt tillämpligt eftersom B2B-beviset är självdeklarerat | Konsumentinformation, ångerrätt och den 2026 införda online-ångerfunktionen kan krävas om privatpersoner faktiskt kan köpa |
| Tillgänglighetslagen | Villkorligt för konsumentinriktad e-handel; mikroföretagsundantag kräver fakta | B2B-status, faktisk konsumentåtkomst och företagets storlek saknar underlag |
| Cybersäkerhetslagen 2025:1506 | Troligen inte tillämplig på en liten generell SaaS enbart av detta skäl, men slutsats kan inte fastställas | Sektor, storlek, koncern och eventuell särskild utpekning saknar signerad bedömning |

### Inspelning

Brottsbalkens regel om olovlig avlyssning aktualiserar bland annat inspelning av samtal där den inspelande inte själv deltar och saknar behörighet. Det går inte att dra slutsatsen att en mötesbot alltid är laglig enbart för att organisatören klickat i en ruta. Samtidigt är inte ”samtycke från alla” den enda tänkbara GDPR-grunden i varje B2B-scenario. API:t kräver och lagrar nu en versionsstyrd affirmation per bot-/uploadmöte, men detta bevisar inte att deltagarna faktiskt informerats eller att rättslig grund finns. Produkten och avtalen ska därför ge tydlig deltagarinformation, förbjuda otillåtna situationer, dokumentera kundinstruktion och stödja stopp/radering. Svensk jurist måste bedöma konkreta bot-, arbetslivs- och känslig-data-scenarier.

### AI

AI-resultat är probabilistiska och kan vara fel. Dokumentvyn markerar nu AI-genererat utkast och instruerar användaren att verifiera beslut, ägare och datum mot transkriptet. AI-systemens rollklassificering, artikel 4-kompetensåtgärder, artikel 50-transparens och eventuella märkningskrav måste ändå dokumenteras per funktion och leverantör. Syncmemos bör uttryckligen förbjuda användning av output för automatiska beslut med rättslig eller jämförbar betydande effekt om sådan användning inte separat bedömts.

## 8. Leverantörer

Ingen rad nedan är godkänd enbart för att integrationen finns i kod. `Ej verifierad` betyder att signerade avtal eller dashboardevidens inte var tillgängliga.

| Leverantör | Ändamål/data | Tekniskt verifierat | Saknat underlag – status `Ej verifierad` |
|---|---|---|---|
| Railway | API, worker, miljöhemligheter och loggar | Publik API-endpoint, TLS och headers | DPA, region, RBAC/MFA, loggretention/scrubbing, deployskydd, incident-/backupupplägg |
| Vercel | Next.js-webb och edge-/byggloggar | Publik webb, TLS och headers | DPA, region, RBAC/MFA, loggar, previewisolering, bygghemligheter |
| Cloudflare | DNS, proxy/CDN och e-postrouting | DNS/HTTP-beteende, SPF/DMARC | DPA, dashboard-RBAC, DNSSEC/WAF/botregler, loggar, region och e-postroutingens åtkomst |
| Supabase | PostgreSQL och ljudlagring | Kod använder DB/storage | DPA, region, privat bucket, service-key-scope, RLS, at-rest-kryptering, backups/PITR, radering ur backup |
| Recall | Mötesbot, inspelning, live-data och webhooks | Signaturverifiering och delete-anrop finns | DPA, region, faktisk inspelnings-/loggretention, deletion SLA/bevis, underbiträden, transfermekanism |
| AssemblyAI | Transkribering av upload-ljud | Koden begränsar endpoint till EU-host | Kontots EU-routing, DPA, retention/no-training, deletion, underbiträden och transfermekanism |
| Google | OAuth och Gemini AI | ID-token verifieras mot audience; e-post måste vara verifierad | OAuth consent/config, DPA/roller, Gemini region/retention/training, deletion och transfers |
| Anthropic | Sammanfattning och chatt | Timeout, storleksgräns och strukturerad output | DPA, region, retention/no-training, deletion, underbiträden och transfers |
| Resend | E-postverifiering | Durable per-adress-sendbudget finns | DPA, region, innehålls-/loggretention, suppressiondata, deletion och DKIM-konfiguration |
| Sentry | Feltelemetri | Integration inventerad | DPA, region, PII-/secret-scrubbing, sampling, retention, access och deletion |
| Paddle | Merchant of Record, checkout, portal och webhooks | Signatur/idempotens och server-skapad checkout finns | Rollfördelning, DPA/privacy terms, konsument-/skatteinställning, retention/deletion, subprocessor/transfer och buyer-dataflöde |

För varje leverantör ska evidenspaketet minst innehålla avtalsversion/datum, roller, datakategorier, registrerade, ändamål, instruktioner, regioner, lagring, backup, radering, underbiträden, incident-SLA, säkerhetsåtaganden, revisionsrätt och mekanism för tredjelandsöverföring.

## 9. Drift och leverantörskedja

### Passiva produktionskontroller

| Kontroll | Resultat |
|---|---|
| HTTPS/redirect | HTTP omdirigerar till HTTPS; apex omdirigerar till `www` |
| TLS | TLS 1.3 observerades för webb och API; certifikat var giltiga på granskningsdagen |
| HSTS | Webb: 63 072 000 sekunder, includeSubDomains, preload. API: 31 536 000 sekunder, includeSubDomains |
| API-headers | Helmet ger bland annat CSP, nosniff, frame-skydd och referrer `no-referrer` |
| Webbheaders | Före åtgärd: HSTS/nosniff/frame deny fanns men CSP/referrer/permissions saknades. Arbetskopian sätter dem; produktionsdeploy ej verifierad |
| CORS | Tillåten origin får ACAO + credentials; främmande origin får inte ACAO |
| Authgräns | `/api/meetings` utan session gav 401; ogiltig share-token gav 404 |
| OAuth | Före åtgärd saknade redirect `state`; arbetskopian implementerar/kräver state, produktion ej omtestad |
| Policyer | Före åtgärd gav policyerna 404 medan signup var öppen; arbetskopian stänger registrering fail-closed tills policyerna publicerats |
| Robot/status | `robots.txt` saknade normal crawlregel; sitemap och security.txt gav 404 |
| DNS/e-post | SPF finns; DMARC `p=none`; DNSSEC kunde inte verifieras |

### CI och beroenden

CI har nu explicit `contents: read`, SHA-pinnade GitHub Actions, separat säkerhetsjobb, hög/kritisk npm-auditgate, hemlighetssökning, Railway CLI `5.30.1`, GitHub Environment `production` och `RAILWAY_TOKEN` endast i de tre steg som faktiskt behöver den. Dashboardbevis för branch protection, required reviewers, environment approval och Railways verkliga tokenscope saknas fortfarande.

Full npm-audit gav fyra moderata utvecklingsberoenden i `drizzle-kit`-kedjan till en äldre esbuild. Ingen high/critical fanns och `npm audit --omit=dev` gav noll produktionssårbarheter. Beslutet är därför: inget tvångsbyte under audit, men planerad kompatibilitetstestad uppgradering före att någon devserver exponeras mot opålitligt nät/innehåll.

## 10. Positiva verifierade kontroller

Följande kontroller passerade och ska bevaras med regressionstester:

- Privata meeting-, transcript-, document-, chat- och live-rutter använder ägarbundna queries och returnerar 404 över ägargränsen.
- Sessioner är slumpmässiga, endast hash lagras i databasen och cookie är `HttpOnly`, `Secure` i produktion samt `SameSite=Lax`.
- Lösenord hashats med Argon2; login använder neutral timing och ändrat lösenord roterar sessioner.
- E-postverifiering är fail-closed för kostnads-/databehandlande routes. Tokens är 256-bitars, hashade och tidsbegränsade.
- Muterande API-anrop kräver exakt tillåten `Origin`; CORS reflekterar endast konfigurerad webborigin.
- Recall och Paddle använder signerade webhooks, rå body, färskhetskontroll där leverantören stöder det och idempotens. AssemblyAI använder en separat delad webhookhemlighet.
- Delningstokens har 128 bitars entropi, är opt-in/tidsbegränsade/återkallelsebara och publik API-representation utesluter ljudsökväg, mötes-URL, bot-ID och deltagarnamn.
- Upload-, AI- och mötesflöden har storleks-/kostnads-/routegränser; upload har även MIME-allowlist, containersignatur och processlokal samtidighetsgräns.
- Produktionsstart validerar viktiga provider-/billingvärden och skyddar mot lokal databas i produktion.
- API-headers via Helmet, TLS, HTTPS-redirect och HSTS är aktiva; Next-konfigurationen lägger motsvarande webbläsarskydd vid nästa deploy.
- Verifierad användar-/routeägarskapstäckning finns i automatiserade tester.
- Inga matchningar för vanliga private-key-, AWS-, GitHub-, Anthropic-, Google AI-, Paddle live- eller Resend-hemlighetsmönster hittades i 357 versionshanterade/icke ignorerade arbetskopiefiler. Skannern körs även i CI.
- Produktionsberoenden hade inga kända npm-sårbarheter enligt audit på granskningsdagen.

## 11. OWASP-jämförelse

Detta är en riktad jämförelse, inte en formell ASVS-certifiering.

| OWASP-område | Bedömning |
|---|---|
| ASVS authentication/session | Delvis uppfyllt: stark cookie/hash/rotation och OAuth-state; MFA, recovery, idle timeout och sessionshantering gapar |
| ASVS access control / API1, API5 | Bra kod- och testbevis för objektägarskap och fail-closed route-gates |
| ASVS input/file / API4 | Delvis: Zod, storleksgränser, allowlist och containersignatur finns; uploadbuffering och global SSE/samtidighet gapar |
| ASVS browser / API8 | API-/origincheck bra och webb-CSP/referrer/permissions finns i arbetskopian; nonce/hash och produktionsbevis saknas |
| ASVS logging/data protection | Kodåtgärdad requestlogg; historiska loggar, retention, åtkomst och scrubbing i externa sänkor är ej verifierade |
| ASVS stored data/privacy | Förbättrad fail-closed radering/gallring; historik, durable retry, backups och providerbevis gapar |
| ASVS communications | Publik TLS/HSTS passerar; intern/providertransport och dashboardconfig ej verifierad |
| API2 broken authentication | OAuth-state är införd; lång session och avsaknad av MFA/recoverykontroll ger öppna gap |
| API4 unrestricted resource consumption | Uploadminne, SSE och lokala limiterare ger öppna gap |
| API6 sensitive business flows | Signup kräver serverlagrad B2B-/villkorsevidens och är fail-closed; oberoende företagsverifiering och persistent limiter saknas |
| API7 SSRF | Ingen generell user-controlled fetch hittades; providerendpoints är konfigurerade och AssemblyAI-origin valideras. Full runtimeverifiering saknas |
| API9 inventory | Rutter/providers är inventerade här; ingen versionerad extern API-inventering eller retirementprocess kunde visas |
| API10 unsafe consumption | Provider timeouts/signaturer/färskhetsfönster finns; avtal, full payloadminimering, retention och dashboardbevis gapar |

## 12. Prioriterad åtgärdsplan

### Omedelbart – 0 till 24 timmar

1. Behåll nykundsregistrering och betalningar stängda; arbetskopian gör registrering fail-closed som extra skydd.
2. Utse incidentansvarig och kartlägg produktionsloggar, åtkomst, retention och möjlig exponering. Dokumentera artikel 33-bedömning med starttid.
3. Rotera/revokera aktiva sessioner och tidigare Recall-live-/andra queryhemligheter som kan ha loggats. Skapa en ny separat `RECALL_REALTIME_WEBHOOK_SECRET`.
4. Återinför inte något heltäckande raderingslöfte förrän provider-, backup- och orphanbevis finns.
5. Fastställ juridisk säljare och håll policyflaggor/registrering stängda tills juridiskt granskade dokument är publicerade.

### Före lansering

1. Granska diffen, ta backup, kör migration `0010` (share), `0011` (B2B/villkor) och `0012` (inspelningsbevis), driftsätt API/webb och kör alla negativa auth/share/webhook-/notice-tester i staging.
2. Konfigurera samma `PUBLIC_REGISTRATION_ENABLED`, `LEGAL_POLICIES_PUBLISHED` och `LEGAL_POLICIES_VERSION` i API/webb; verifiera att fel config stänger signup och att policyversionen matchar DB-evidensen.
3. Konfigurera Recall-signaturhemligheten, kontrollera signerade/ogiltiga/för gamla leveranser och verifiera att inga queryhemligheter eller headers loggas.
4. Backfill/rensa historiska webhook-payloads, Paddle-e-post och orphan-ljud; inför durable raderingskö/dead-letter och leverantörsbevis.
5. Lägg server-side bevis per inspelning och antingen starkare företagsverifiering eller komplett B2C-efterlevnad.
6. Publicera juridiskt granskade privacy notice, villkor, DPA, providerlista, retention och säljar-/pris-/skatteinformation.
7. Slutför DPIA/RoPA, incident-/DSR-runbooks samt artikel 28/kapitel V-underlag för samtliga providers.
8. Verifiera GitHub/Railway/Vercel/Cloudflare/Supabase/provider-RBAC/MFA, WAF, tokenräckvidd, loggar, backup/PITR, restore och larm.
9. Kör passiva produktionskontroller av CSP/headers, OAuth-state, policyer, share no-store/noindex, CORS och authgränser. Funktionstesta Paddle mot CSP.

### Inom 30 dagar

1. Flytta rate limiting till delad store och lägg SSE-/global resurskvot.
2. Inför MFA/passkeys, sessionsvy, idle timeout och säker återställning.
3. Genomför AI Act-klassificering, AI-kompetensutbildning och prompt-injection/kvalitetsevals.
4. Uppgradera den moderata Drizzle/esbuild-utvecklingskedjan efter regressionstest.
5. Kör full historisk secret scan och verifiera samtliga logg-, artifact- och imageytor.
6. Genomför återställningsprov, kontoraderingsprov, DSR-övning och incident-tabletop.
7. Aktivera DNSSEC och flytta DMARC-rapporter till en styrd funktionsadress.

### Löpande

- npm/OS-/containeraudit vid varje ändring och minst månadsvis; high/critical kräver dokumenterat releasebeslut.
- Kvartalsvis åtkomst-, nyckel-, provider-, backup/restore-, DSR- och gallringskontroll.
- Årlig extern penetrationstestning och efter större auth-, share-, upload-, AI- eller billingändring.
- Årlig juridisk applicability review och omedelbar omprövning vid ny marknad, konsumentflöde, ny AI-funktion eller leverantör.
- Mät tid till radering, orphan-data, incidenttriage, MFA-täckning, patchtid och restore-resultat.

## 13. Kvarstående risk och ej verifierade kontroller

Lansering kan inte omklassificeras från `STOPP` förrän minst följande bevis finns:

- driftsatt kod och produktionsbevis att känsliga auth-/webhookvärden aldrig loggas;
- incidentbedömning och dokumenterad rotation/revokering efter SEC-001/SEC-004;
- körda migreringar `0010`/`0011`, ny Recall-signaturhemlighet och negativa produktions-/stagingtester för OAuth, share, webhook och kontoradering;
- inventering/backfill och komplett raderingskedja inklusive failed audio, failed/historiska webhooks, Paddle mirror, providerkopior och relevanta backups;
- publicerade korrekta policyer/säljaruppgifter, matchande policyversion i API/webb och tillräcklig B2B-/avtalsstyrning;
- DPA/region/retention/transfer/radering för varje leverantör;
- DPIA/RoPA/DSR/incidentplan och genomförda övningar;
- dashboardbevis för prod-RBAC/MFA, hemligheter, WAF, loggar, backup/PITR och restore;
- dokumenterat beslut för samtliga high/critical-beroenden. Vid denna audit fanns inga sådana produktionsberoenden.

Även efter åtgärd återstår inneboende risker: deltagare kan dela känsligt innehåll, AI kan ge fel, en auktoriserad mottagare kan vidarebefordra en share, tredjepartsleverantörer kan drabbas av incident och kunden kan använda inspelning i en otillåten kontext. Dessa risker kräver produktkontroller, avtal, utbildning, övervakning och incidentberedskap – inte enbart kod.

## 14. Test- och kontrolljournal

| Kontroll | Resultat |
|---|---|
| API-tester | 74 testfiler; 754 godkända, 5 avsiktligt hoppade |
| Webtester | 19 testfiler; 97 godkända |
| Typkontroll | Godkänd för API och webb |
| Lint | Godkänd för webb |
| Produktionsbygg | Godkänd för API och Next.js |
| Databasmigreringar | Migrationerna 0000–0012 applicerades i PGlite-repositorytesterna; nya notice-fält round-trip-verifierades |
| Lokal runtimebegränsning | Lokalt Node 24.11.1 trots projektkrav/CI Node 20.x. `drizzle-kit generate` stoppades av värdmiljöns `uv_os_get_passwd ENOMEM`; 0012 SQL/metadata verifierades genom JSON-parse, PGlite, typer och bygg. Node 20-CI krävs före deploy |
| `npm audit --omit=dev` | 0 sårbarheter |
| Full `npm audit` | 4 moderata dev-sårbarheter; 0 high/critical |
| Nuvarande secret-mönster | 357 versionshanterade/icke ignorerade arbetskopiefiler; inga träffar för de specificerade högsignalsmönstren; historik/artifacts/loggar ej verifierade |
| Diffkontroll | Godkänd; inga whitespacefel (`git diff --check`) |
| Ägargränser | Automatiserade tester för privata mötesresurser godkända |
| Produktion | Endast passiva/säkra kontroller; inga riktiga konton eller kunddata användes |

## 15. Officiella rätts- och standardskällor

- [EU:s dataskyddsförordning, GDPR (EU) 2016/679](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A32016R0679), särskilt artiklarna 5, 6, 9, 12–15, 17, 28, 30, 32–35 och 44–49.
- [Svensk kompletterande dataskyddslag (2018:218)](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2018218-med-kompletterande-bestammelser_sfs-2018-218/).
- [IMY: konsekvensbedömning i arbetslivet](https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/arbetsliv/tillaten-behandling--vilka-krav-galler/konsekvensbedomning/) och [IMY:s riktlinjer om konsekvensbedömning](https://www.imy.se/globalassets/dokument/riktlinjer-om-konsekvensbedomning-avseende-dataskydd.pdf).
- [Brottsbalk (1962:700), 4 kap. 9 a §](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/brottsbalk-1962700_sfs-1962-700/).
- [EU:s AI-förordning (EU) 2024/1689, konsoliderad lydelse 2026-07-27](https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng) och [EU-kommissionen om AI-kompetens](https://digital-strategy.ec.europa.eu/en/policies/ai-talent-skills-and-literacy).
- [Lag (2002:562) om elektronisk handel](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2002562-om-elektronisk-handel-och-andra_sfs-2002-562/), särskilt 8–13 §§.
- [Marknadsföringslag (2008:486)](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/marknadsforingslag-2008486_sfs-2008-486/), särskilt 9–12 §§.
- [Lag (2022:482) om elektronisk kommunikation, 9 kap. 28 §](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2022482-om-elektronisk-kommunikation_sfs-2022-482/) och [PTS om kakor](https://pts.se/internet-och-telefoni/kakor-cookies/).
- [Lag (2005:59) om distansavtal och avtal utanför affärslokaler](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-200559-om-distansavtal-och-avtal-utanfor_sfs-2005-59/) och [Konsumentverket om ångerfunktion från 19 juni 2026](https://www.konsumentverket.se/nyhet/lagandring-gor-det-enklare-att-angra-kop-pa-natet/).
- [Lag (2023:254) om vissa produkters och tjänsters tillgänglighet](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2023254-om-vissa-produkters-och-tjansters_sfs-2023-254/).
- [Cybersäkerhetslag (2025:1506)](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/cybersakerhetslag-20251506_sfs-2025-1506/).
- [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) och [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x03-introduction/).

---

**Nästa beslutspunkt:** rapportägaren ska tilldela varje kritiskt/högt fynd en namngiven person och verifieringsdatum. `STOPP` får endast ändras efter oberoende kontroll av åtgärderna; antaganden eller muntliga uppgifter räcker inte som godkännande.
