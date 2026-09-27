# Säkerhetsbeslut som kräver ägaren

Här samlas frågor som kräver åtkomst till driftmiljö eller ett produktbeslut. Kodarbete och tester fortsätter utan att ändra produktion. Svara i den här filen eller i uppgiften när du har tid.

## Väntar på svar

### D01 — Bedöm och rotera befintliga driftuppgifter (G20)

- **Vad betyder det?** Skanningen hittade en lokal `apps/api/.env` med uppgifter som ser ut att kunna ge åtkomst till driftleverantörer. Filen är ignorerad av Git, men det bevisar inte att värdena aldrig har delats via loggar, arkiv eller andra kanaler.
- **Vad behöver du avgöra?** Har dessa uppgifter använts i produktion, och vem kan kontrollera eventuell exponering samt rotera dem hos respektive leverantör?
- **Mitt förslag:** Kontrollera exponering utan att kopiera värdena till PR, terminalutskrift eller detta dokument. Rotera aktiva uppgifter i en planerad driftåtgärd och verifiera tjänsterna efteråt.
- **Status:** Väntar på ägarens svar. Ingen rotation eller produktionsändring är gjord.

### D02 — Kontrollera äldre Paddle-kopplingar (G04)

- **Vad betyder det?** Den lokala fixen hindrar nya kundövertaganden via återanvänd e-post. Äldre kundrader kan redan ha fel ägare, och rader utan ägare kan inte säkert kopplas till någon enbart genom adressen.
- **Vad behöver du avgöra?** Kan en behörig person jämföra äldre appkonton och Paddle-kunder med Paddle-ID och ursprungliga `appUserId`, utan att dela kunddata i en PR?
- **Mitt förslag:** Granska avvikande eller dubbla kopplingar i en kontrollerad driftprocess innan en unik databaskoppling eller manuell korrigering görs. Ändra inte ägare utifrån e-postmatchning.
- **Status:** Väntar på ägarens svar. Inga produktionsrader har ändrats.

### D03 — Granska äldre Google-länkningar (G01)

- **Vad betyder det?** En del befintliga konton kan ha fått Google-inloggning genom den osäkra automatiska kopplingen. Kodfixen kan stoppa nya fall, men kan inte avgöra vilka gamla länkar som verkligen tillhör kontoinnehavaren.
- **Vad behöver du avgöra?** Vem kan granska sådana konton med begränsad åtkomst och kontakta berörda användare vid behov?
- **Mitt förslag:** Behåll revisionsspår utan råa token och gör individuell bedömning före frånkoppling eller återställning.
- **Status:** Väntar på ägarens svar. Inga befintliga konton har ändrats.

### D04 — Samordna e-postbyte med Paddle (G04)

- **Vad betyder det?** Paddle kräver unik kundadress. Om A byter adress i appen men Paddle fortfarande har A:s gamla adress, kan B som senare registrerar den gamla adressen inte skapa en ny Paddle-kund. Att koppla B till A:s kund skulle ge B tillgång till A:s betaldata.
- **Vad behöver du avgöra?** Ska en verifierad adressändring synkroniseras till Paddle genom ett återförsökbart jobb, och vem ska hantera konflikter med äldre eller raderade konton?
- **Mitt förslag:** Synkronisera kontaktadress först efter bevisad ny adress och behåll kundägaren på oföränderligt användar-ID. Vid konflikt, visa ett tydligt supportärende. Granska äldre kundrader före massuppdatering.
- **Status:** Väntar på ägarens svar. Kodfixen ger en kontrollerad konflikt i stället för att flytta ägare eller returnera ett generiskt serverfel.

### D05 — Kontrollera webbens API-adress i Vercel (G11)

- **Vad betyder det?** Produktionsbyggen kräver nu `NEXT_PUBLIC_API_URL=https://api.syncmemos.com`. Ett saknat eller annat värde stoppar bygget i stället för att låta webben skicka inloggningsuppgifter till localhost eller ett felaktigt ursprung.
- **Vad behöver du avgöra?** Är variabeln satt till den adressen för produktion och eventuella förhandsmiljöer som bygger med produktionsläge?
- **Mitt förslag:** Kontrollera Vercels miljöinställningar före merge. Sätt adressen till den godkända API-värden för de miljöer som ska kunna byggas. En annan API-värd kräver ett uttryckligt produktbeslut och ändrad allowlist i kod.
- **Status:** Väntar på ägarens svar. Inga Vercel-inställningar har ändrats.

### D06 — Kontrollera Recall-läge före API-merge (G16)

- **Vad betyder det?** Produktions-API:t startar nu inte med `BOT_PROVIDER=fake`. Det publika Recall-ingestflödet kräver signatur även när en fake-adapter är vald i lokal utveckling.
- **Vad behöver du avgöra?** Är driftmiljön redan konfigurerad med `BOT_PROVIDER=recall`, API-nyckel, signerande webhookhemligheter och publik HTTPS-webhookadress?
- **Mitt förslag:** Kontrollera miljövariablerna utan att kopiera hemligheter till PR. Sätt Recall-konfigurationen före merge om botfunktionen ska vara aktiv; håll annars releasen tillbaka tills produktläget är bestämt.
- **Status:** Väntar på ägarens svar. Inga leverantörsinställningar har ändrats.

### D07 — Bedöm äldre verifieringslänkar i loggar (G18)

- **Vad betyder det?** Tidigare loggtransport skrev hela verifieringslänkar till API-loggar. Nya loggar gör inte det, men äldre loggar kan fortfarande innehålla giltiga engångslänkar.
- **Vad behöver du avgöra?** Har `EMAIL_PROVIDER=log` använts i en delad miljö, och vem kan granska åtkomst och retention för dessa loggar utan att kopiera länkarna?
- **Mitt förslag:** Bedöm exponering i drift, rensa eller begränsa gamla loggar enligt befintlig retention och återkalla giltiga token om obehörig åtkomst är möjlig. Kontrollera att produktion använder Resend före merge.
- **Status:** Väntar på ägarens svar. Ingen loggrensning eller tokenrotation har gjorts.

### D08 — Granska plattformarnas accessloggar för delningslänkar (G19)

- **Vad betyder det?** API-koden redigerar nu delningstoken i egna loggar. Tidigare loggar och plattformarnas accessloggar kan fortfarande innehålla råa URL:er som ger läsåtkomst till ett möte.
- **Vad behöver du avgöra?** Vilka proxy- och webbaccessloggar sparas hos Railway och Vercel, vem kan läsa dem, och vilka aktiva delningslänkar kan ha hamnat där?
- **Mitt förslag:** Begränsa URL-loggning och retention där det går, granska åtkomsten utan att exportera token till PR, och rotera berörda aktiva delningstoken om de kan ha exponerats.
- **Status:** Väntar på ägarens svar. Ingen loggrensning eller tokenrotation har gjorts.

### D09 — Kontrollera e-postledger före API-merge (G06)

- **Vad betyder det?** Nya API-koden stoppar verifieringsutskick om tabellen `email_send_ledger` saknas eller inte går att nå. Tabellen finns i repositoryts migration `0008_deep_warbird.sql`, men faktisk produktionsdatabas har inte kontrollerats här.
- **Vad behöver du avgöra?** Vem kan bekräfta att migrationskedjan till och med `0021` är körd i drift och att API-rollen kan läsa och skriva i e-postledgern innan en PR slås ihop?
- **Mitt förslag:** Kör migrationskontrollen före merge och testa ett syntetiskt verifieringsutskick i en säker driftlik miljö. Behåll fail-closed-beteendet om kontrollen misslyckas.
- **Status:** Väntar på ägarens svar. Ingen produktionsdatabas eller e-postleverantör har ändrats.

### D10 — Verifiera transkriptionscallback i drift (G23)

- **Vad betyder det?** API:t kräver nu en publik HTTPS-basadress för AssemblyAI-callback när in-room-inspelning är på. En giltig URL i konfigurationen bevisar inte att DNS, brandvägg, webhookhemlighet och leverantörens leverans fungerar.
- **Vad behöver du avgöra?** Är `PUBLIC_WEBHOOK_URL` satt till den faktiska API-adressen i drift, och vem kan köra ett syntetiskt AssemblyAI-jobb som bekräftar callback och slutavräkning utan kunddata?
- **Mitt förslag:** Kontrollera leverantörens callback-URL och ett fullständigt syntetiskt transkriptionsflöde före merge eller innan in-room-funktionen aktiveras.
- **Status:** Väntar på ägarens svar. Ingen leverantörs- eller driftkonfiguration har ändrats.

### D11 — Bekräfta Recall-medialänkens värd i vald region (G24)

- **Vad betyder det?** Kodfixen accepterar signerade transkriptlänkar från Recalls dokumenterade S3-bucketvärdar och avvisar andra värdar. Recall kan använda en annan bucket eller regionvärd för den faktiska arbetsytan.
- **Vad behöver du avgöra?** Vilken `download_url`-värd returnerar ett syntetiskt Recall-transkript i den produktionsregion som används? Dela bara värdnamnet, inte URL:ens signerade query eller kunddata.
- **Mitt förslag:** Kontrollera ett syntetiskt transkript mot allowlisten före merge. Lägg till exakt ny dokumenterad bucketvärd om den legitima regionen kräver det; öppna inte för godtyckliga S3-buckets.
- **Status:** Väntar på ägarens svar. Inga leverantörs- eller nätverksinställningar har ändrats.

### D12 — Avstämning av osäkra botskapanden (G07/G30)

- **Vad betyder det?** Om Recall skapar en bot men svaret går förlorat saknar appen bot-ID. Säkerhetsfixen behåller då mötesreservationen i `pending` för att inte tillåta fler betalda botar under samma kvot. Användaren kan därför tillfälligt bli blockerad.
- **Vad behöver du avgöra?** Vem kan med behörig Recall-åtkomst avstämma en syntetisk eller verklig föräldralös bot mot appens `meetingId` och säkert avgöra när reservationen får frigöras?
- **Mitt förslag:** Bygg ett begränsat driftflöde som söker Recall på intern metadata, granskar status och loggar beslutet innan en föräldralös reservation frisläpps. Testa det med syntetisk bot och förlorat svar. Frigör inte automatiskt en okänd aktiv bot efter en kort timeout.
- **Status:** Väntar på ägarens svar. Ingen provider- eller produktionsändring är gjord.

### D13 — Verifiera Recall-tid och avräkning vid saknad metadata (G10)

- **Vad betyder det?** Botens inspelningslängd hämtas nu från Recalls tidsstämplar. Om de saknas avräknas den reserverade maximala tiden för att tyst inspelning inte ska ge nollförbrukning. En felande bot kan därför förbruka hela möteskvoten även om den knappt spelade in.
- **Vad behöver du avgöra?** Kan ett syntetiskt Recall-möte i den använda regionen bekräfta fälten `recordings[].started_at/completed_at`, botens statusförlopp och faktisk debiteringsgrund, även vid tystnad och avbrutet transkript?
- **Mitt förslag:** Kör ett kort syntetiskt möte och ett felmöte utan kunddata. Jämför providerrespons, intern ledger och leverantörens fakturerade tid. Behåll konservativ avräkning tills en säker kortare regel kan bevisas.
- **Status:** Väntar på ägarens svar. Ingen provider- eller produktionsändring är gjord.

### D14 — Avstäm föräldralösa AssemblyAI-jobb (G31)

- **Vad betyder det?** Om ett transkriptionsjobb skapas men API-svaret eller lagringen av jobb-ID går förlorad skickar arbetaren inte ett nytt betalt jobb. Mötesreservationen hålls då kvar och användaren kan tillfälligt sakna transkript och ledig kvot.
- **Vad behöver du avgöra?** Finns en behörig väg hos AssemblyAI för att identifiera ett syntetiskt jobb via intern mötesreferens eller uppladdad ljud-URL, och vem får avstämma ett verkligt oklart jobb innan kvoten frigörs?
- **Mitt förslag:** Bekräfta leverantörens stöd för idempotens eller sökning. Bygg ett begränsat driftflöde med spårbart beslut för att binda upptäckt jobb-ID eller säkert frigöra en definitivt ej skapad beställning. Prova förlorat svar utan kunddata. Återförsök inte automatiskt efter timeout.
- **Status:** Väntar på ägarens svar. Ingen provider- eller produktionsändring är gjord.

### D15 — Avstäm fastnade chattanspråk och providerkostnad (G13)

- **Vad betyder det?** En chattfråga reserverar en plats innan modellen anropas. Ett osäkert providersvar blir nu `unknown_user`: platsen räknas mot livstidskvoten utan att blockera nästa fråga när kapacitet finns. Om processen dör efter anspråket kan `pending_user` ligga kvar utan synligt svar och låsa chatten. En äldre API-replika känner inte till `unknown_user` och kan därför överskrida kvoten under blandad utrullning.
- **Vad behöver du avgöra?** Hur kan ett syntetiskt misslyckat chattanrop och dess faktiska kostnad verifieras hos Gemini och Claude, vem får frigöra ett fastnat anspråk och kan chattanrop pausas tills alla API-repliker kör den nya versionen?
- **Mitt förslag:** Lägg till ett begränsat driftflöde som listar gamla osynliga anspråk, avstämmer providerutfall och loggar beslut innan frigöring. Kontrollera om leverantörerna stöder idempotens för generering; annars undvik automatiskt omförsök efter tvetydigt svar. Spärra chatttrafik under blandad utrullning eller driftsätt atomiskt så att ingen äldre replika tar emot frågor efter aktivering.
- **Status:** Väntar på ägarens svar. Ingen provider- eller produktionsändring är gjord.

### D16 — Bestäm dokumentbudget och avstäm fastnade genereringar (G14)

- **Vad betyder det?** Den nya gränsen tillåter tre betalda genereringsförsök per möte, inklusive misslyckade eller osäkra providerutfall. Ett färskt dokument återanvänds i tio minuter. En krasch kan lämna ett anspråk i 15 minuter, varefter ett nytt försök får ta över inom samma livstidsbudget. Användaren kan behöva support om tre försök förbrukas av fel.
- **Vad behöver du avgöra?** Är tre försök per möte en godtagbar produktgräns, och vem får granska faktiska providerkostnader och återställa ett fastnat anspråk eller bevilja ett nytt försök efter dokumenterat fel?
- **Mitt förslag:** Behåll gränsen tills verklig kostnad och legitim användning har mätts. Bygg en behörighetsstyrd avstämning med revisionsspår innan manuella återställningar. Pausa dokumentgenerering under blandad utrullning så att äldre API-repliker inte kringgår budgeten.
- **Status:** Väntar på ägarens senare beslut. Ingen provider- eller produktionsändring är gjord.

### D17 — Avstäm äldre dubbla Recall-botbindningar (G17)

- **Vad betyder det?** Migration 0024 kräver att varje lagrat `bot_id` pekar på högst ett möte. Om samma bot-ID finns på flera möten stoppar migrationen i stället för att välja ett konto. Den gamla kopplingen kan redan ha påverkat transkript eller status.
- **Vad behöver du avgöra?** Finns dubbla icke-null `bot_id` i produktionsdatabasen, och vem får jämföra mötena med Recalls ursprungliga bot-ID och metadata utan att exponera kundtranskript?
- **Mitt förslag:** Kör en skrivskyddad gruppkontroll före deployment. Om dubbletter finns, pausa utrullningen och granska varje rad med behörig åtkomst; korrigera bara efter verifierad ägare och bevara revisionsspår. Kör sedan migration och syntetiskt webhookprov.
- **Status:** Väntar på ägarens senare driftkontroll. Inga produktionsrader har ändrats.

### D18 — Avstäm fastnat Recall-transkriptanspråk (G17)

- **Vad betyder det?** Migration 0025 låter bara en arbetare åt gången hämta och sammanfatta samma bots transkript. Ett retrybart fel frigör anspråket. Om processen dör efter anspråket och före terminal status kan anspråket ligga kvar och hindra automatisk fortsatt behandling. Att frigöra det blint kan dubblera betald sammanfattning eller skriva över ett sent resultat.
- **Vad behöver du avgöra?** Vem får kontrollera Recalls jobbstatus, det lagrade transkriptet och faktisk modellkostnad för ett fastnat möte, och vem får därefter frigöra anspråket med revisionsspår?
- **Mitt förslag:** Inför en behörighetsstyrd avstämning som först jämför providerutfall, mötesstatus, transkript och sammanfattning. Frigör bara ett specifikt anspråk efter dokumenterat beslut; automatiskt tidsbaserat övertagande bör vänta tills ett sent workersvar kan stängslas säkert. Kör ett syntetiskt kraschprov hos Recall.
- **Status:** Väntar på ägarens senare driftbeslut. Inga provider- eller produktionsändringar är gjorda.

### D19 — Bekräfta ljudkontrollens driftgränser och avräkning (G09)

- **Vad betyder det?** Uppladdad ljudtid mäts nu genom fullständig avkodning före lagring och betald transkribering. Vissa förlustkomprimerade format ger upp till en extra debiterad sekund på grund av kodarpadding; en fil exakt vid plangränsen kan därför avvisas konservativt. Om FFmpeg eller ffprobe saknas, kraschar eller når tidsgränsen avvisas uppladdningen. Långa giltiga inspelningar kan behöva mer kapacitet eller en annan produktgräns. För äldre redan pågående uppladdningar utan verifierad duration dras hela den tidigare reservationen vid slutbokföring.
- **Vad behöver du avgöra?** Finns FFmpeg och ffprobe i den verkliga API-runtime som byggs från `nixpacks.toml`, vilken maximal längd och väntetid är acceptabel för Team/Business, och får äldre uppladdningar avräknas till reserverat maximum när betrodd mediatid saknas?
- **Mitt förslag:** Verifiera runtime-binärerna och kör syntetiska tysta filer nära respektive plangräns mot staging samt en signerad AssemblyAI-callback. Mät CPU, minne, svarstid och providerkostnad. Behåll avvisning vid timeout och konservativ avräkning tills en säkrare, verifierad regel finns. Informera support om att äldre pågående uppladdningar kan få maxavräkning.
- **Status:** Väntar på ägarens senare driftbeslut. Inga provider- eller produktionsändringar är gjorda.

### D20 — Verifiera Google-utbytets kapacitet i drift (G03)

- **Vad betyder det?** Migration 0026 skapar åtta delade providerplatser. Varje tokenutbyte och hämtning av Googles signeringscertifikat har åtta sekunders transporttimeout utan automatiskt retry; platsen släpps efter verifieringen eller återtas efter 30 sekunder vid processkrasch. När alla platser används måste användaren starta ett nytt OAuth-flöde. En äldre API-replika saknar gränsen under blandad utrullning.
- **Vad behöver du avgöra?** Är åtta samtidiga Google-utbyten och en väntetid på högst åtta sekunder per providerbegäran rimliga för faktisk trafik? Kan API-utrullningen ske så att äldre repliker inte fortsätter ta emot callbacks efter migration och aktivering?
- **Mitt förslag:** Kontrollera migrationens åtta rader och API-rollens rättigheter före utrullning. Belastningsprova syntetiska OAuth-callbacks över minst två riktiga repliker, följ legitima avslag och bekräfta att inga gamla repliker tar providertrafik. Behåll fail-closed-beteendet vid databasfel.
- **Status:** Väntar på drift- och kapacitetskontroll. Ingen produktionskonfiguration eller provider har ändrats.

### D21 — Avstäm Paddle-anrop och osäkra skapandesvar (G15)

- **Vad betyder det?** Migration 0027 ger åtta delade billing-platser och fönsterbudgetar på tio försök per användare och 80 globalt per minut. En plats hålls under hela arbetsflödet, men återtas efter tio minuter vid processkrasch. SDK-anropen har ingen verifierad transportdeadline, så ett äldre hängande anrop kan fortfarande pågå när platsen återtas. [Paddle säger att portallänkar är tillfälliga och inte ska cachelagras](https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session/) och [att API:t saknar idempotensnycklar](https://developer.paddle.com/sdks/libraries/). Ett timeout- eller nätverksfel efter att Paddle skapat en kund eller transaktion kan därför ge osäkert utfall.
- **Vad behöver du avgöra?** Är åtta samtidiga flöden, tio försök per konto/minut, 80 globala försök/minut och högst tio minuters väntan efter en krasch acceptabelt? Vem får avstämma osäkra Paddle-utfall och frigöra ett spärrat checkout-anspråk efter att providerdata och webhookar har kontrollerats? Kan äldre API-repliker dräneras innan gränsen aktiveras?
- **Mitt förslag:** Behåll färska portalsessioner. Lägg en verifierad transportdeadline kortare än leasen och ett beständigt checkout-anspråk med manuell avstämning vid osäkert svar innan G15 stängs. Prova med två verkliga repliker och Paddle sandbox, inklusive processkrasch och sent providersvar. Blockera nytt skapande för samma konto vid osäkert utfall tills avstämningen är klar; återanvänd aldrig en okänd kund via e-post.
- **Status:** Väntar på ägarens senare drift- och supportbeslut. Endast lokal kod och tester; ingen produktionsmigration eller Paddle-inställning har ändrats.

### D22 — Välj registreringsflöde utan kontouppslagning (G12)

- **Vad betyder det?** När offentlig registrering är aktiv ger en fri adress 201 och session, medan en upptagen adress ger 409. Ett neutralt felmeddelande ensamt löser inte läckan eftersom sessionen och efterföljande `/auth/me` fortfarande skiljer fallen. Även byte till en upptagen adress ger ett särskilt fel.
- **Vad behöver du avgöra?** Ska registrering och adressbyte bli e-postförst-flöden där kontroll av den nya adressen sker innan kontot aktiveras eller ändras? Det innebär att användaren inte får en session omedelbart efter registreringsformuläret och att återhämtning för befintliga konton behöver vara tydlig.
- **Mitt förslag:** Använd samma neutrala HTTP-svar och cookie-beteende för fri och upptagen adress före adressbevis. Skicka endast en säker, begränsad åtgärdslänk till den verkliga adressägaren; aktivera konto eller adressbyte först efter bevis. Behåll delad utskicks- och hashbudget.
- **Status:** Väntar på senare produktbeslut. Kodarbete med övriga fynd fortsätter; offentlig driftinställning har inte kontrollerats.
- **Reproducerat 2026-09-27:** Två avsiktligt röda HTTP-test visar att fri/upptagen signup ger 201 med sessionscookie respektive 409, och att `change-email` ändrar adressen vid ledig adress men ger 409 vid upptagen. Kör `npm.cmd run test --workspace api -- src/adapters/http/routes/account-discovery.regression.test.ts` efter att testet återställts från separat stash `cf6e1cfd1241a8efc8f9aeaa3523df61358dfd40`. Testet ingår inte i G35/G37-grenen eftersom D22 fortfarande är öppet.

### D23 — Kontrollera verklig proxykedja för IP-gränser

- **Vad betyder det?** API:t litar på två proxyhopp för `req.ip`, som används av flera gränser för inloggning, registrering och waitlist. Koden antar att Railways kant skriver över klientens `X-Forwarded-For`. Om den verkliga kedjan skiljer sig kan en angripare påverka IP-nyckeln, eller så får många användare samma nyckel. Skanningen kunde inte bevisa driftkedjan och rapporterade därför inget separat fynd.
- **Vad behöver du avgöra?** Vilka IP-headers och hopp når API:t i den faktiska Railway-installationen, och kan en klientlevererad header överleva kanten? Kontrollera utan att logga riktiga klientadresser i PR.
- **Mitt förslag:** Kör syntetiska anrop med och utan förfalskad `X-Forwarded-For` via den riktiga publika kanten samt kontrollera API:ts observerade `req.ip` och 429-gränser. Konfigurera betrodda proxyer efter uppmätt kedja och behåll globala databaskvoter.
- **Status:** Väntar på driftkontroll. Ingen proxyinställning har ändrats.

### D24 — Bestäm rensning och avstämning av misslyckade Recall-inspelningar (G34–G35)

- **Vad betyder det?** Kodens sweep väljer inte misslyckade botmöten med bot-ID för inspelningsradering. Ett parallellt kontoraderingsförsök kan dessutom förlora referensen till en bot som ännu skapas. Källkoden visar bristerna, men Recalls faktiska lagringstid och möjlighet att hitta en bot via metadata är inte verifierade.
- **Vad behöver du avgöra?** Hur länge ska en misslyckad inspelning hållas för support och omförsök, vem får avstämma botskapande med okänt utfall, och vilka leverantörsverktyg finns för att hitta och radera en bot utan lokalt ID?
- **Mitt förslag:** Vägra kontoradering medan providerarbete är osäkert, behåll ett beständigt anspråk tills utfallet är avstämt, och radera kända misslyckade botinspelningar automatiskt efter en kort dokumenterad period med omförsök och revisionsspår. Kontrollera Recalls verkliga retention separat.
- **Status:** Väntar på senare drift- och produktbeslut. Ingen providerkonfiguration eller kunddata har ändrats.
- **Utökad avstämning G37:** En historisk misslyckad uppladdning utan säkert AssemblyAI-avslag kan redan ha ett externt jobb trots saknat lokalt jobb-ID. Nya spärrar lämnar då kontoraderingen öppen och kräver kontroll hos AssemblyAI; sätt inte ett efterhandskvitto enbart utifrån lokal `failed`-status. Även ett sent providersvar vars ID inte kunde bindas till databasen behöver samma avstämning.
