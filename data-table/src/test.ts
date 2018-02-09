/**
 * @leizm/distributed-data-table
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { expect } from "chai";
import DataTable from "./index";

describe("test @leizm/distributed-data-table", function() {
  it("base", function(done) {
    const dt = new DataTable({
      redis: { db: 1 }
    });
    dt.ready().then(async () => {
      await dt.set("a", 123);
      await dt.set("b", 456);
      {
        const a = await dt.get("a");
        const b = await dt.get("b");
        expect(a).to.equal(123);
        expect(b).to.equal(456);
      }

      await dt.incr("a");
      await dt.incr("b", 3);
      {
        const a = await dt.get("a");
        const b = await dt.get("b");
        expect(a).to.equal(124);
        expect(b).to.equal(459);
      }

      await dt.decr("a");
      await dt.decr("b", 3);
      {
        const a = await dt.get("a");
        const b = await dt.get("b");
        expect(a).to.equal(123);
        expect(b).to.equal(456);
      }

      expect(dt.getSync('a')).to.equal(123);
      expect(dt.getSync('b')).to.equal(456);

      dt.destroy();
      done();
    });
  });
});