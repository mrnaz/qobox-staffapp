// Semantic icon colours.
//
// One colour per concept, drawn from the palette already in the theme, so a
// class is the same blue everywhere and a ticket the same orange. That is what
// separates a colour system from confetti: the colour carries meaning, and a
// glance at the icon tells you which part of the app you are looking at.
//
// Navigation chrome is deliberately excluded — chevrons, close buttons, the
// search glyph and back arrows stay neutral. Colouring those competes with the
// content and makes lists harder to scan.
const CONCEPT = {
    // education
    'school-outline': 'azure',
    school: 'azure',
    classes: 'azure',
    'graduation-cap': 'azure',
    'library-outline': 'azure',

    // time
    'calendar-outline': 'purple',
    calendar: 'purple',
    'calendar-clear-outline': 'purple',
    'calendar-check-o': 'purple',
    'time-outline': 'indigo',
    'clock-o': 'indigo',
    timetable: 'indigo',
    'hourglass-outline': 'indigo',

    // people
    'people-outline': 'turquoise',
    people: 'turquoise',
    users: 'turquoise',
    students: 'turquoise',
    'person-outline': 'turquoise',
    person: 'turquoise',
    user: 'turquoise',
    'person-add-outline': 'turquoise',
    child: 'turquoise',

    // documents / reports
    'document-text-outline': 'teal',
    'document-outline': 'teal',
    'document-attach-outline': 'teal',
    'file-text-o': 'teal',
    reports: 'teal',
    'clipboard-outline': 'teal',

    // work items
    ticket: 'tangerine',
    tickets: 'tangerine',
    'construct-outline': 'tangerine',
    roster: 'amber',
    'calendar-number-outline': 'amber',

    // communication
    'chatbubble-ellipses-outline': 'cyan',
    'chatbubble-ellipses': 'cyan',
    'chatbubbles-outline': 'cyan',
    'chatbubble-outline': 'cyan',
    'mail-outline': 'cyan',
    'mail-open-outline': 'cyan',
    'mail-unread-outline': 'cyan',
    'envelope-o': 'cyan',
    'megaphone-outline': 'rose',
    megaphone: 'rose',

    // metadata: muted on purpose — a location pin sits inside a sentence and
    // should not pull attention away from it. `steel` is the palette's grey.
    'location-outline': 'steel',
    location: 'steel',
    'business-outline': 'steel',
    'building-o': 'steel',
    'map-marker': 'steel',

    // content
    home: 'emerald',
    'home-outline': 'emerald',

    'folder-outline': 'choco',
    folder: 'choco',
    'book-outline': 'lime',
    book: 'lime',
    'bookmark-outline': 'lime',
    'qr-code-outline': 'indigo',
    'qr-code': 'indigo',
};

// Icons that must stay neutral: pure navigation and input affordances.
const NEUTRAL = new Set([
    'chevron-back', 'chevron-forward', 'chevron-down', 'chevron-up',
    'close', 'close-circle', 'search', 'search-outline',
    'ellipsis-horizontal', 'ellipsis-vertical', 'menu', 'th',
    'arrow-back', 'arrow-forward', 'add', 'remove',
    // filter/sort affordances are controls, not content
    'funnel', 'funnel-outline', 'options-outline', 'filter',
    // row metadata + edit affordances: quiet by design
    'attach', 'create-outline', 'pencil',
    // the theme toggle is a control, not content
    'sun-o', 'moon-o', 'sunny-outline', 'moon-outline',
]);

// State icons keep their state colour rather than a palette hue.
const STATE = {
    'alert-circle-outline': 'error',
    'alert-circle': 'error',
    'warning-outline': 'warning',
    'information-circle-outline': 'info',
    'information-circle': 'info',
    'trash-outline': 'error',
    trash: 'error',
    'log-out-outline': 'error',
    'sign-out': 'error',
    'log-in-outline': 'success',
    'checkmark-circle': 'success',
    'checkmark-circle-outline': 'success',
    checkmark: 'success',
    'checkmark-outline': 'success',
    'check-square-o': 'success',
    'close-circle-outline': 'error',
};

// Returns a colour for `name`, or `fallback` when the icon is chrome.
// `colors` is the active theme's colour object.
export function iconColor(name, colors, fallback) {
    if (!name || NEUTRAL.has(name)) return fallback ?? colors.textSecondary;

    const state = STATE[name];
    if (state) return colors[state] || colors.primary;

    const concept = CONCEPT[name];
    // The palette entries expose { border, background, text }; `text` is the
    // saturated tone, and it is already tuned per theme.
    if (concept && colors[concept]?.text) return colors[concept].text;

    return fallback ?? colors.primary;
}

export default iconColor;
