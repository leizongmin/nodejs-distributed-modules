/**
 * @leizm/distributed-events
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { expect } from "chai";
import EventEmitter from "./index";

describe("test @leizm/distributed-events", function() {
  it("base", function(done) {
    const e = new EventEmitter();
    e.on("hello", (a: number, b: number, c: number) => {
      expect(a + b).to.equal(c);
      done();
    });
    e.emit("hello", 4, 5, 9);
  });
});
