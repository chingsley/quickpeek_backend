"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.delayInSeconds = void 0;
const delayInSeconds = (timeout) => new Promise((res) => {
    setTimeout(() => {
        res(null);
    }, timeout * 1000);
});
exports.delayInSeconds = delayInSeconds;
