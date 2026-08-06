"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sortQuestionFeedByDefaultPriority = void 0;
const hasViewerRequest = (item) => item.viewerRequest != null;
/**
 * Default Home feed priority tiers (highest first):
 * 1. Incoming or outgoing with unread messages (FIFO by earliest unread)
 * 2. Incoming nearby without a request to answer (distance ascending)
 * 3. Other incoming without a request to answer (createdAt descending)
 * 4. Incoming with interaction but all messages read (createdAt descending)
 * 5. Outgoing with all messages read (createdAt descending)
 */
const tierForItem = (item, viewerId) => {
    var _a, _b;
    const unreadCount = (_b = (_a = item.feedAttention) === null || _a === void 0 ? void 0 : _a.unreadMessageCount) !== null && _b !== void 0 ? _b : 0;
    if (unreadCount > 0)
        return 1;
    const isIncoming = item.userId !== viewerId;
    // Tier 2 = nearby AND answerable. An out-of-scope question never ranks
    // here even inside the browse radius, and a far ANYWHERE question stays out
    // even though it is technically answerable.
    if (isIncoming && !hasViewerRequest(item) && item.nearMe && item.eligible)
        return 2;
    if (isIncoming && !hasViewerRequest(item))
        return 3;
    if (isIncoming)
        return 4;
    return 5;
};
const toTime = (value) => {
    if (!value)
        return null;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
};
const sortQuestionFeedByDefaultPriority = (items, viewerId) => [...items].sort((a, b) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const tierA = tierForItem(a, viewerId);
    const tierB = tierForItem(b, viewerId);
    if (tierA !== tierB)
        return tierA - tierB;
    if (tierA === 1) {
        const unreadA = (_c = (_b = toTime((_a = a.feedAttention) === null || _a === void 0 ? void 0 : _a.earliestUnreadAt)) !== null && _b !== void 0 ? _b : toTime(a.createdAt)) !== null && _c !== void 0 ? _c : 0;
        const unreadB = (_f = (_e = toTime((_d = b.feedAttention) === null || _d === void 0 ? void 0 : _d.earliestUnreadAt)) !== null && _e !== void 0 ? _e : toTime(b.createdAt)) !== null && _f !== void 0 ? _f : 0;
        if (unreadA !== unreadB)
            return unreadA - unreadB;
    }
    if (tierA === 2) {
        const distA = (_g = a.distanceKm) !== null && _g !== void 0 ? _g : Number.POSITIVE_INFINITY;
        const distB = (_h = b.distanceKm) !== null && _h !== void 0 ? _h : Number.POSITIVE_INFINITY;
        if (distA !== distB)
            return distA - distB;
    }
    const createdA = (_j = toTime(a.createdAt)) !== null && _j !== void 0 ? _j : 0;
    const createdB = (_k = toTime(b.createdAt)) !== null && _k !== void 0 ? _k : 0;
    if (createdA !== createdB)
        return createdB - createdA;
    return a.id.localeCompare(b.id);
});
exports.sortQuestionFeedByDefaultPriority = sortQuestionFeedByDefaultPriority;
