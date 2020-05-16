const EventEmitter = require("events");

module.exports = class MatchingQueue extends EventEmitter {
  constructor(options) {
    super({ captureRejections: true });
    this.canMatch = options.canMatch;
    this.items = [];
  }
  some(predicate) {
    return this.items.some(predicate);
  }
  removeWhere(predicate) {
    this.items = this.items.filter((item) => !predicate(item));
  }
  push(newItem) {
    const index = this.items.findIndex((item) => this.canMatch(item, newItem));
    if (index === -1) {
      this.items.push(newItem);
    } else {
      const [matchedItem] = this.items.splice(index, 1);
      this.emit("match", matchedItem, newItem);
    }
  }
};
