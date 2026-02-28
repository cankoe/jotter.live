/**
 * Curated emoji shortcode map — common emojis used in messaging and notes.
 * Shortcode (without colons) → emoji character.
 */
export const emojiMap: Record<string, string> = {
    // Smileys & People
    smile: "😄", grinning: "😀", joy: "😂", rofl: "🤣", smiley: "😃",
    sweat_smile: "😅", laughing: "😆", wink: "😉", blush: "😊", yum: "😋",
    sunglasses: "😎", heart_eyes: "😍", kissing_heart: "😘", thinking: "🤔",
    expressionless: "😑", unamused: "😒", rolling_eyes: "🙄", grimacing: "😬",
    relieved: "😌", pensive: "😔", sleepy: "😪", drooling: "🤤",
    sleeping: "😴", mask: "😷", nerd: "🤓", confused: "😕",
    worried: "😟", frowning: "☹️", open_mouth: "😮", hushed: "😯",
    astonished: "😲", flushed: "😳", scream: "😱", fearful: "😨",
    cold_sweat: "😰", cry: "😢", sob: "😭", angry: "😠", rage: "😡",
    innocent: "😇", cowboy: "🤠", clown: "🤡", devil: "😈",
    skull: "💀", ghost: "👻", alien: "👽", robot: "🤖",
    poop: "💩", fire: "🔥", sparkles: "✨", star: "⭐", star2: "🌟",
    zap: "⚡", boom: "💥", sweat_drops: "💦",

    // Gestures & Body
    wave: "👋", ok_hand: "👌", v: "✌️", crossed_fingers: "🤞",
    point_up: "☝️", point_down: "👇", point_left: "👈", point_right: "👉",
    thumbsup: "👍", "+1": "👍", thumbsdown: "👎", "-1": "👎",
    clap: "👏", raised_hands: "🙌", pray: "🙏", handshake: "🤝",
    muscle: "💪", brain: "🧠", eyes: "👀", eye: "👁️",

    // Hearts & Symbols
    heart: "❤️", orange_heart: "🧡", yellow_heart: "💛", green_heart: "💚",
    blue_heart: "💙", purple_heart: "💜", black_heart: "🖤", white_heart: "🤍",
    broken_heart: "💔", sparkling_heart: "💖", heartbeat: "💓",
    100: "💯", checkmark: "✅", x: "❌", warning: "⚠️",
    question: "❓", exclamation: "❗", no_entry: "⛔",
    check: "✔️", ballot_box: "☑️",

    // Nature & Animals
    dog: "🐶", cat: "🐱", mouse: "🐭", rabbit: "🐰", fox: "🦊",
    bear: "🐻", panda: "🐼", monkey: "🐵", chicken: "🐔", penguin: "🐧",
    bird: "🐦", eagle: "🦅", butterfly: "🦋", bug: "🐛", bee: "🐝",
    snake: "🐍", turtle: "🐢", fish: "🐟", dolphin: "🐬",
    whale: "🐳", unicorn: "🦄", dragon: "🐉",

    // Food & Drink
    apple: "🍎", pizza: "🍕", hamburger: "🍔", fries: "🍟",
    taco: "🌮", burrito: "🌯", egg: "🥚", coffee: "☕",
    tea: "🍵", beer: "🍺", wine: "🍷", cocktail: "🍸",
    cake: "🎂", cookie: "🍪", chocolate: "🍫", candy: "🍬",
    ice_cream: "🍨", donut: "🍩", popcorn: "🍿",

    // Activities & Objects
    soccer: "⚽", basketball: "🏀", football: "🏈", baseball: "⚾",
    trophy: "🏆", medal: "🏅", crown: "👑", gem: "💎",
    bulb: "💡", flashlight: "🔦", wrench: "🔧", hammer: "🔨",
    gear: "⚙️", key: "🔑", lock: "🔒", unlock: "🔓",
    bell: "🔔", megaphone: "📢", loudspeaker: "📢",
    book: "📖", books: "📚", memo: "📝", pencil: "✏️",
    pen: "🖊️", paperclip: "📎", scissors: "✂️",
    folder: "📁", calendar: "📅", chart: "📊",
    envelope: "✉️", email: "📧", inbox: "📥", outbox: "📤",
    phone: "📱", computer: "💻", keyboard: "⌨️", printer: "🖨️",
    camera: "📷", video: "📹", tv: "📺", radio: "📻",
    clock: "🕐", hourglass: "⏳", alarm: "⏰", stopwatch: "⏱️",

    // Travel & Places
    car: "🚗", bus: "🚌", train: "🚆", airplane: "✈️",
    rocket: "🚀", ship: "🚢", bike: "🚲", house: "🏠",
    building: "🏢", hospital: "🏥", school: "🏫", church: "⛪",
    mountain: "🏔️", camping: "🏕️", beach: "🏖️",
    sun: "☀️", cloud: "☁️", rain: "🌧️", snow: "❄️",
    rainbow: "🌈", moon: "🌙", earth: "🌍",

    // Flags & Misc
    flag: "🏁", party: "🎉", tada: "🎉", balloon: "🎈",
    confetti: "🎊", gift: "🎁", ribbon: "🎀",
    art: "🎨", music: "🎵", notes: "🎶", microphone: "🎤",
    headphones: "🎧", guitar: "🎸", piano: "🎹", drum: "🥁",
    movie: "🎬", gaming: "🎮", dice: "🎲", puzzle: "🧩",
    pill: "💊", syringe: "💉", dna: "🧬", petri_dish: "🧫",
    satellite: "🛰️", atom: "⚛️",
};

/** Array of [shortcode, emoji] for autocomplete */
export const emojiEntries: [string, string][] = Object.entries(emojiMap);
