const moment = require('moment');

// Returns the prefix of `sections` (whole sections only, never split) whose
// cumulative item count is >= visibleCount — i.e. the first `visibleCount`
// items rounded up to complete the section they fall in. If visibleCount
// already covers every section, returns all of them with hasMore: false.
//
// Domain-agnostic: works for any `sections` shaped as
// [{ date: 'YYYY-MM-DD', data: [...] }, ...], regardless of what `data`
// holds (class periods, calendar events, etc).
function computeVisibleSections(sections, visibleCount) {
    let total = 0;
    for (let i = 0; i < sections.length; i++) {
        total += sections[i].data.length;
        if (total >= visibleCount) {
            return { visible: sections.slice(0, i + 1), hasMore: i + 1 < sections.length };
        }
    }
    return { visible: sections, hasMore: false };
}

// Finds which section a caller should scroll to: the first section on or
// after `referenceMoment`, or the last section before it if none qualify.
// Returns null if `sections` is empty. `itemCountThroughSection` is the
// cumulative item count through and including the returned section — callers
// use this to make sure enough of `sections` is revealed (see
// computeVisibleSections) before actually scrolling to it.
//
// Pass `moment()` (today) for "scroll to today, else nearest" behavior, or
// any other date to scroll to that specific date, else its nearest neighbor.
function findScrollTarget(sections, referenceMoment) {
    if (sections.length === 0) return null;

    let targetIndex = sections.findIndex((s) => moment(s.date).isSameOrAfter(referenceMoment, 'day'));
    if (targetIndex === -1) targetIndex = sections.length - 1;

    let itemCountThroughSection = 0;
    for (let i = 0; i <= targetIndex; i++) {
        itemCountThroughSection += sections[i].data.length;
    }

    return { sectionIndex: targetIndex, itemCountThroughSection };
}

module.exports = { computeVisibleSections, findScrollTarget };
