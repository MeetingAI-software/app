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
