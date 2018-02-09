/**
 * @leizm/distributed-events
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { expect } from "chai";
import EventEmitter from "./index";

describe("test @leizm/distributed-events", function() {
  it("base", function(done) {
    const e = new EventEmitter({ redis: { db: 0 } });
    e.on("hello", (a: number, b: number, c: number) => {
      expect(a + b).to.equal(c);

      e.destroy();
      done();
    });
    e.emit("hello", 4, 5, 9);
  });

  it("once", function(done) {
    const e = new EventEmitter({ redis: { db: 1 } });
    e.once("hello", (a: number, b: number, c: number) => {
      expect(a + b).to.equal(c);

      e.once("hello", (a: number, b: number) => {
        expect(a).to.equal(b);

        e.destroy();
        done();
      });
      e.emit("hello", 3, 3);
    });
    e.emit("hello", 4, 5, 9);
  });

  it("multi clients & multi methods", function(done) {
    const e1 = new EventEmitter();
    const e2 = new EventEmitter();
    e1.on("hello", (s: string) => {
      expect(s).to.equal("world");

      e1.destroy();
      e2.destroy();
      done();
    });
    e2.emit("hello", "world");
  });
});
