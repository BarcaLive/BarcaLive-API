// Native fetch is available in Node 18+

async function run() {
    try {
        const res = await fetch("https://api.barcalive.online/?data=match&iso=PL");
        const json = await res.json();

        // Find upcoming/live match
        const live = json.matches.live[0];
        const upcoming = json.matches.upcoming[0];
        const target = live || upcoming;

        if (target) {
            console.log("Target Match ID:", target.id);
            console.log("TV Field:", JSON.stringify(target.tv, null, 2));
        } else {
            console.log("No target match found.");
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
