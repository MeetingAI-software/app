# Plan: få allt klart till dagen Paddle svarar

> **Historisk plan från 2026-08-27 — inte aktuell drift- eller lanseringsstatus.**
> Planen nedan bevaras som bakgrund till arbetet i security- och dokumentationsgrenarna.
> Ånger-/refund-textfixarna finns redan i `main` på `8b579e6`; withdrawal-grenens återstående
> ändring är detta dokument. Uppföljningen 2026-09-11 använder tre befintliga PR:er i ordningen
> **PR75 security → PR76 docs → PR77 withdrawal**, med bas main och utan ny historikomskrivning.
> De befintliga migrationerna `0011`–`0013` bevaras; security tillför bryggmigration `0014`
> och additiva `0015`/`0016`. Uppgifterna nedan om ombasering, omnumrering, saknade dokument,
> branchavstånd, ingen exponering och endast externa blockerare beskriver den äldre planen;
> de är inte verifierade slutsatser om dagens kod, personuppgifter eller drift.
> Använd [aktuell överlämning](launch-handoff.md) från PR76 och
> [premerge-checklistan](security-branch-premerge.md) från PR75. De anger kvarvarande kodarbete,
> verifierad backup, miljö-/Recall-samordning och separat Vercel-/Railway-releasekontroll.
> Denna historiska plan ger inget godkännande att öppna registrering, betalningar eller legal-grindar.

## Context

Syncmemos väntar på Paddles tredje svar om den lagstadgade ångerfunktionen. Den frågan
blockerar bara legal-grinden — men i praktiken har allt annat också stannat, och det finns
mer kvar än vad handoffen ger intryck av.

Målet med den här planen är att flytta allt som **inte** beror på Paddle så långt fram att
dagen svaret kommer återstår bara: rådgivarens granskning, ifyllnad av säljaruppgifter, och
att slå om två flaggor. Inte veckor av arbete.

En sak som ändrar bilden: **19 juni 2026 har redan passerat.** Kravet på online-ångerfunktion
gäller sedan drygt två månader. Ni har ingen exponering eftersom ni inte säljer, men det finns
ingen anpassningsperiod kvar — funktionen måste finnas dag ett.

Och en teknisk sak som styr hela sekvensen: `.github/workflows/ci.yml` kör
`railway run --environment production -- npm run db:migrate` **automatiskt vid varje merge
till main**, före deploy. Att merga säkerhetsbranchen är alltså inte en kodhändelse utan en
produktionshändelse. Det måste förberedas, inte upptäckas.

## Vad som gäller genom hela planen

- `LEGAL_POLICIES_PUBLISHED`, `LEGAL_WITHDRAWAL_FLOW_APPROVED` och
  `BILLING_MUTATIONS_ENABLED` förblir `false`. Ingen Domain Review, ingen Live-katalog,
  ingen Live-nyckel, ingen riktig betalning.
- Inga personuppgifter, ID-handlingar, bankuppgifter, hemadresser eller hemligheter i repot,
  i chatten, i commits, i tester eller som platshållare.
- Allt jag skriver av juridisk karaktär är **utkast för rådgivaren**, inte färdig text.

---

## Spår A — Säkerhetsbranchen (jag, först)

`fix/security-compliance-hardening` är den kritiska vägen och blir dyrare för varje dag.
Den är 58 commits efter main och rapporten beskriver ett träd som är lika gammalt.

**A1. Gör branchen mergebar.**
- Rebasa på `origin/main`.
- Numrera om `apps/api/drizzle/0010_windy_master_mold.sql` — den krockar med mains
  `0010_abnormal_human_robot.sql` (waitlist) i både filnamn och journalens `idx: 10`.
  Regenerera snapshots och `_journal.json`.
- Lös de sex konflikterna: migrationssnapshot, `_journal.json`,
  `apps/api/src/adapters/http/routes/upload-inputs.ts` + test,
  `.../upload.routes.ts` + test, `apps/web/next.config.ts` (båda sidor rörde CSP).
- Grön `npm test`, `npm run typecheck`, `npm run build`. Commit löpande.

**A2. Skriv en pre-merge-checklista som del av PR:en.** Eftersom merge = produktionsmigrering
+ deploy måste följande vara gjort **innan** merge, annars startar API:t inte:
- `RECALL_REALTIME_WEBHOOK_SECRET` satt i Railway (hårt krav vid boot när Recall och
  live-transkribering är på; saknas den blir det `process.exit(1)`).
- `RECALL_LIVE_WEBHOOK_TOKEN` avvecklad.
- Alla produktionsvärden kontrollerade mot de skärpta gränserna branchen inför (`PORT`,
  `MAX_UPLOAD_MB` 1–100, `SESSION_TTL_DAYS` 1–90, `MAX_MEETING_SECONDS` 60–28800 m.fl.).
  Ett värde utanför intervallet blir ett hårt bootfel.
- Databasbackup tagen.

**A3. Rapporten uppdateras.** `docs/security-compliance-audit.md` är daterad mot ett träd som
inte finns längre. Den ska peka på den rebasade commiten, annars är granskningsunderlaget fel.

PR:en lämnas för **din** granskning. Ingen automerge — rapporten kräver det, och nu vet vi
också varför: merge rör produktion direkt.

## Spår B — Efterlevnadsluckor branchen INTE täcker (jag)

Kartläggningen av nuvarande kod hittade tre saker som rådgivaren kommer fråga om och som
säkerhetsbranchen inte åtgärdar:

**B1. Misslyckade möten städas aldrig.** `apps/api/src/jobs/sweep.ts` städar bara möten med
status `transcribed` (`meeting.repository.ts:160-171`). `failed` är ett terminalt tillstånd —
så ljudfilen i Supabase Storage och inspelningen hos Recall ligger kvar **för alltid** på varje
misslyckat möte. Det är en verklig lagringsdefekt, inte en teoretisk.

**B2. `webhook_events` behåller råa leverantörspayloads för evigt.** Tabellen har ingen
ägarkolumn, ingen retention och rörs inte av kontoradering (`schema.ts:52`). Recall- och
AssemblyAI-payloads där innehåller transkriberat innehåll. En raderad användares mötesinnehåll
finns alltså kvar i klartext. Samma sak i mindre skala: `paddle_customers.email` överlever
radering via `onDelete: 'set null'`.

**B3. Ingen dataexport.** Radering är den enda implementerade rättigheten. Artikel 15 och 20
(tillgång och dataportabilitet) har ingen endpoint alls.

Förslag: fixa B1 och B2 i kod — de är avgränsade och tar bort verklig risk. B3 löses först
som **dokumenterad manuell rutin** i DSR-dokumentet nedan; en självbetjäningsexport är en
större sak som inte behöver blockera lansering.

## Spår C — Skrivbordsprodukterna rådgivaren kommer kräva (jag)

En genomgång av samtliga 17 dokument i `docs/` visar att **ingen av de fyra finns, och ingen av
dem nämns ens som saknad.** Det är inte uppskjutet arbete — det är en blind fläck. Repot är
starkt på lagringstider, radering och fail-closed-grindar, men inget i den nuvarande
lanseringssekvensen skulle få de här fyra att dyka upp innan ni tar emot en riktig betalning.

Alla skrivs som utkast i `docs/`, med uttryckliga `Not verified`-markeringar där
leverantörsunderlag saknas — samma ärliga stil som `docs/data-processors.md` redan använder.

- **DPIA** — konsekvensbedömning i proportion till mötesinspelningar, transkript och AI-genererat
  innehåll om identifierbara tredje parter som aldrig varit i kontakt med er. Underlaget finns
  redan i era egna ord: `docs/data-retention.md:25` beskriver ljudet som *"a biometric-adjacent
  recording of identifiable people who did not all individually consent to us holding it"* —
  det är precis den profil som utlöser en DPIA-prövning.
- **RoPA** — registerförteckning enligt artikel 30. `docs/data-processors.md` är strukturellt
  en halv RoPA redan (leverantör, ändamål, datakategorier, region, lagringstid) men saknar
  personuppgiftsansvarig, rättsliga grunder och överföringsgarantier. Bygg vidare på den
  i stället för att börja om.
- **DSR-rutin** — hur begäran om tillgång, rättelse, radering och portabilitet tas emot,
  identifieras, besvaras inom en månad och dokumenteras. Två luckor som måste täckas:
  B3 (ingen export) som manuell process, och att en **mötesdeltagare som inte har konto**
  idag saknar väg in helt — `docs/support-email.md` tilldelar inget DSR-ansvar till
  supportbrevlådan, trots att den är er enda offentliga kanal.
- **Incidentrutin** — artikel 33/34, med 72-timmarsklockan och vem som gör vad. Det som finns
  idag är deploy-rollbacks och en post mortem av 8 augusti-incidenten, inte en incidentplan.
  Sentry tar emot fel men inget dokument säger vem som tittar eller vad som händer sedan.

Dessa är rena skrivbordsprodukter, de beror inte på Paddle, och de är exakt vad ett
rådgivarmöte annars går åt till att förklara.

## Spår D — Egen ångerfunktion, som design (jag)

Förberedelse för att Paddle svarar nej på waiver-frågan. **Ingen implementation**, bara design
och beslutsunderlag, så att ett nej kostar dagar i stället för veckor.

Designen måste hantera två saker Paddle inte bekräftat: själva **frånträdandeförklaringen** och
ett **omedelbart varaktigt mottagningsbevis**. Och den måste respektera Paddles instruktion
"do not build a separate withdrawal-processing mechanism that bypasses Paddle" — alltså: vi tar
emot och kvitterar förklaringen, Paddle utför återbetalningen. Skissen ska täcka datamodell,
identifiering av köpet, kvittensutskick, svensk och engelsk copy, tillgänglighet, och vad som
lagras och hur länge.

## Spår E — Vad bara du kan göra

Det här är den faktiska kritiska vägen till Live. Kod är inte flaskhalsen.

1. **Boka rådgivare och Skatteverket den här veckan.** Inget är bokat idag, och
   `docs/legal-seller-readiness.md` har stått stilla sedan 21 augusti. Ledtiden här är
   sannolikt längre än allt mitt arbete tillsammans. `docs/skatteverket-call-brief.md` finns
   redan som underlag.
2. **Välj exakt en juridisk säljare** och lös den **lagliga offentliga adressen**. Utan
   `LEGAL_SELLER_NAME`, adress och telefon returnerar grinden `null` även med båda flaggorna
   `true` — koden kan alltså inte publiceras oavsett vad Paddle svarar. Adressfrågan är den
   svåraste eftersom ni inte vill publicera hemadress. Det här är fem av de sju obockade
   rutorna i `docs/legal-seller-readiness.md`; de två sista är utbetalningskonto och ett
   undertecknat ägaravtal (tio klausuler listade, inget utkast finns).
3. **Samla leverantörsunderlaget.** Tio leverantörer i `docs/data-processors.md` står som
   `Not verified` på både region och DPA. Underskattat: det är tio separata
   leverantörsrelationer, och `docs/legal-pages.md` kräver att rådgivaren granskar
   integritetspolicyn *mot den faktiska produktionskonfigurationen* — DPA-arbetet grindar
   alltså den juridiska granskningen. Jag gör en checklista per leverantör med exakt vad som
   ska hämtas var; själva hämtandet kräver era dashboard-inloggningar.
4. **Utse ägare.** Fyra dokument kräver namngivna ägare och inget har någon: de sju
   `Unassigned`-raderna i `legal-seller-readiness.md`, *"a rollback owner"* i
   `paddle-live-operations.md`, primär- och backup-ägare för supportbrevlådan, och en ägare
   per DPA. Det är en tio-minutersövning som annars stoppar er mitt i lanseringen.
5. **Stäng de tio rutorna i `docs/support-email.md`.** Statusraden säger att det fungerar,
   men alla tio acceptanskryss är obockade — inklusive SPF/DKIM/DMARC `PASS` i faktiska
   headers och test mot en andra leverantör. Antingen är kryssen inaktuella eller så är de
   inte gjorda, och repot skiljer inte på det.
6. **Paddle-eskalering** om det tystnar: tre arbetsdagar → följ upp i tråden med Seller ID,
   fem arbetsdagar → `sellers@paddle.com` med ämnesraden
   `Follow-up: Swedish online withdrawal function compliance`.

## Spår F — Överlämningsdokumentet

`docs/launch-handoff.md`, sanerat så att det kan ligga i repot: inga personuppgifter, ingen
adress, inget Seller ID — bara pekare till att de finns privat hos er.

Innehåll: vad Syncmemos är kommersiellt och juridiskt, grindarkitekturen och de absoluta
reglerna, Paddle-korrespondensens läge och bedömningsreglerna för nästa svar, repots tillstånd,
öppna poster per spår med ägare, och vad "klart" betyder. Länkas från `README.md` bredvid de
andra runbooksen så nästa chatt hittar den utan att du behöver klistra in något.

**Plus ett `docs/README.md` som index.** Idag finns lanseringssekvensen bara utspridd som
korsreferenser mellan `legal-seller-readiness` → `skatteverket-call-brief` →
`live-preflight-waiting` → `legal-pages` → `paddle-live-operations` → `customer-validation`.
Ingen enda fil skriver ut ordningen. Den närmaste är verifieringsordningen i
`paddle-production-hardening.md:45-53`, men den är en sammanfattning, inte en checklista.
Ett index som namnger ordningen och ägaren per steg är det som gör att du slipper "jag fattar
inte riktigt vad vi ska göra".

Två småsaker städas samtidigt: `docs/email-verification.md:46` länkar till `DEPLOYMENT.md`
som inte finns i repot, och undantaget för `drizzle-kit` → `esbuild` i
`docs/dependency-security.md` är daterat 13 augusti och ska kontrolleras om.

---

## Ordning

**Först, en kvarleva:** `fix/withdrawal-copy-not-refund` har tre gröna commits som aldrig
pushades. Den ska pushas och få en PR innan något annat, annars ligger arbetet bara lokalt.
Den rör bara webbtext bakom en stängd grind, så merge är lågrisk — men merge är fortfarande en
produktionsdeploy, så `legal:smoke --mode=closed` körs efteråt. Samtidigt städas de ~6
redan mergade brancherna bort.

Sedan: spår A — det blockerar allt nedströms och åldras. Sedan C och D parallellt med att du
kör E. B när A är mergad, eftersom B rör samma filer. F skrivs sist av mig men först i tiden
för dig, så du har den om du byter chatt.

Spår E börjar **nu**, oberoende av allt jag gör.

## Verifiering

Per delsteg, före varje commit: `npm test`, `npm run typecheck`, `npm run build`.

För säkerhetsbranchen dessutom, före merge: pre-merge-checklistan i A2 avbockad, backup tagen,
och de negativa testerna rapporten kräver (OAuth-state, share expiry/revoke, webhook-signatur
och färskhet, kontoradering).

Efter varje produktionsdeploy, för att bevisa att grinden fortfarande är stängd:

```
npm run legal:smoke -- --base-url=https://www.syncmemos.com --mode=closed
```

Notera `www` — apex svarar 308 och skriptet följer inte redirects, vilket ger falskt
underkänt. Det står redan så i `docs/live-preflight-waiting.md`.

Skrivbordsprodukterna i spår C har ingen automatisk verifiering. Deras kvalitetskrav är att
rådgivaren kan läsa dem utan att behöva fråga oss vad vi menar.
