export class FSM {
  constructor(owner, initialStateName, statesByName) {
    this.owner = owner;
    this.states = statesByName;
    this.current = null;
    this.currentName = "";
    this.timeInState = 0;
    this.setState(initialStateName);
  }

  setState(nextName, data = undefined) {
    if (!this.states[nextName]) {
      throw new Error(`FSM: Unknown state "${nextName}"`);
    }
    if (this.currentName === nextName) return;

    const prev = this.current;
    const prevName = this.currentName;
    if (prev && typeof prev.exit === "function") prev.exit(this.owner, nextName);

    this.current = this.states[nextName];
    this.currentName = nextName;
    this.timeInState = 0;

    if (this.current && typeof this.current.enter === "function") {
      this.current.enter(this.owner, prevName, data);
    }
  }

  update(dt) {
    this.timeInState += dt;
    if (this.current && typeof this.current.update === "function") {
      this.current.update(this.owner, dt);
    }
  }
}

