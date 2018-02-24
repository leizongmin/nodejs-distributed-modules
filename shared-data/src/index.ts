/**
 * @leizm/distributed-shared-data
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import * as events from "events";
import * as Redis from "ioredis";
import * as createDebug from "debug";

export interface Options {
  /** Redis连接配置 */
  redis?: Redis.RedisOptions;
  /** 键前缀，默认"d:" */
  keyPrefix?: string;
  /** 频道名称，默认为":sync"，如果设置了前缀则会加上前缀 */
  channelKey?: string;
  /** 自定义ID，用于唯一标识当前客户端 */
  id?: string;
}

export type WatchHandler = (
  type: "update" | "delete",
  key: string,
  value: any,
  pattern: string
) => void;

export const COUNTER_SYMBOL = Symbol("counter");
export const READY_EVENT_SYMBOL = Symbol("ready event");

export class SharedData {
  protected static [COUNTER_SYMBOL]: number = 0;

  protected readonly id: string;
  protected readonly debug: debug.IDebugger;
  protected readonly event: events.EventEmitter = new events.EventEmitter();
  protected readonly keyPrefix: string;
  protected readonly channelKey: string;
  protected readonly redisSub: Redis.Redis;
  protected readonly redisPub: Redis.Redis;
  protected readonly syncData: Map<string, any> = new Map();
  protected isReady: boolean = false;
  protected isInitSync: boolean = false;
  protected readonly watchPatterns: Map<string, RegExp> = new Map();

  constructor(options?: Options) {
    options = options || {};
    SharedData[COUNTER_SYMBOL]++;
    this.debug = createDebug(
      `@leizm:distributed-shared-data:#${SharedData[COUNTER_SYMBOL]}`
    );

    // 键值
    this.keyPrefix = options.keyPrefix || "d:";
    this.channelKey = options.channelKey || ":sync";
    if (this.keyPrefix) {
      this.channelKey = this.keyPrefix + this.channelKey;
    }
    this.id =
      options.id ||
      `${Date.now()}.${process.pid}.${Math.floor(Math.random() * 1000000)}`;

    // 初始化订阅Redis实例
    this.redisSub = new Redis(options.redis);
    if (options.redis && options.redis.db) {
      this.redisSub.select(options.redis.db);
    }
    this.redisSub.on("error", err => {
      this.debug("redisSub.onerror => %s", err);
      this.event.emit("error", err);
    });
    this.redisSub.on("message", (ch, str) => {
      this.debug("redisSub.onmessage => ch=%s str=%s", ch, str);
      if (ch === this.channelKey) {
        let data: {
          k: string;
          i: string;
          d?: number;
        };
        try {
          data = JSON.parse(str);
        } catch (err) {
          this.debug("redisSub.onmessage error: %s", err);
          this.event.emit("error", err);
          return;
        }
        // 如果同步请求来自当前客户端（通过ID判断），则忽略此次更新
        if (data.i === this.id) {
          this.debug("ignore sync: %j", data);
          if (data.d === 1) {
            this.event.emit("delete", data.k);
          } else {
            this.event.emit("update", data.k, this.getSync(data.k));
          }
          return;
        }
        // 删除数据
        if (data.d === 1) {
          this.debug("sync: delete %s", data.k);
          this.syncData.delete(data.k);
          this.event.emit("delete", data.k);
          return;
        }
        // 更新数据
        this.get(data.k, false).then(value => {
          this.debug("sync: %s=%j", data.k, value);
          this.event.emit("update", data.k, value);
        });
      }
    });
    this.redisSub.subscribe(this.channelKey, () => {
      this.debug("redisSub.subscribe.ready");
      this.isReady = true;
      this.checkReady();
    });

    // 初始化发布Redis实例
    this.redisPub = new Redis(options.redis);
    if (options.redis && options.redis.db) {
      this.redisPub.select(options.redis.db);
    }
    this.redisSub.on("error", err => {
      this.debug("redisSub.on(error) => %s", err);
      this.event.emit("error", err);
    });

    // 初始化时自动全量同步数据
    let keys: string[];
    this.redisPub
      .keys(this.key("d:*"))
      .then(ret => {
        keys = ret;
        if (keys.length < 1) return [];
        return this.redisPub.mget(...keys);
      })
      .then((values: string[]) => {
        values.forEach((v, i) => {
          const k = this.stripKeyPrefix(keys[i]);
          this.debug("init sync: %s=%j", k, v);
          try {
            v = JSON.parse(v);
          } catch (err) {
            const newErr = new TypeError(
              `sync data failed: key=${k}, value=${v}, ${err}`
            );
            this.debug(newErr);
            this.event.emit("error", newErr);
          }
          this.syncData.set(k, v);
        });
        this.isInitSync = true;
        this.debug("syncData.init.ready");
        this.checkReady();
      });

    // 处理watch事件
    this.event.on("update", (key: string, value: any) => {
      for (const [pattern, reg] of this.watchPatterns.entries()) {
        reg.lastIndex = 0;
        if (reg.test(key)) {
          this.debug(
            "emit watch: type=update, pattern=%s, key=%s, value=%s",
            pattern,
            key,
            value
          );
          this.event.emit(`watch ${pattern}`, "update", key, value, pattern);
        }
      }
    });
    this.event.on("delete", (key: string, value: any) => {
      for (const [pattern, reg] of this.watchPatterns.entries()) {
        reg.lastIndex = 0;
        if (reg.test(key)) {
          this.debug(
            "emit watch: type=delete, pattern=%s, key=%s, value=%s",
            pattern,
            key,
            value
          );
          this.event.emit(`watch ${pattern}`, "delete", key, value, pattern);
        }
      }
    });

    this.debug("create: %s", this.id);
  }

  /**
   * 监听事件
   * @param event 时间名称
   * @param listener 监听器函数
   */
  public on(event: string, listener: (...args: any[]) => void): this {
    this.debug("on(%s) => %s", event, listener);
    this.event.on(event, listener);
    return this;
  }

  /**
   * 监听事件
   * @param event 时间名称
   * @param listener 监听器函数
   */
  public once(event: string, listener: (...args: any[]) => void): this {
    this.debug("on(%s) => %s", event, listener);
    this.event.once(event, listener);
    return this;
  }

  /**
   * 等待就绪
   */
  public ready(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isReady && this.isInitSync) return resolve();
      this.event.once(READY_EVENT_SYMBOL, resolve);
    });
  }

  /**
   * 检查是否就绪
   */
  protected checkReady() {
    if (this.isReady && this.isInitSync) {
      this.event.emit(READY_EVENT_SYMBOL);
    }
  }

  /**
   * 销毁
   */
  public destroy() {
    this.redisPub.disconnect();
    this.redisSub.disconnect();
  }

  /**
   * 添加键前缀
   * @param key
   */
  public key(key: string): string {
    return this.keyPrefix + key;
  }

  /**
   * 去除键前缀
   * @param key
   */
  public stripKeyPrefix(key: string): string {
    return key.slice(this.keyPrefix.length);
  }

  /**
   * 发送同步数据事件
   * @param key
   * @param value
   */
  protected publishSyncDataEvent(
    key: string,
    value: any,
    isDelete: boolean = false
  ): Promise<any> {
    return this.redisPub.publish(
      this.channelKey,
      JSON.stringify(
        isDelete ? { k: key, i: this.id, d: 1 } : { k: key, i: this.id }
      )
    ) as any;
  }

  /**
   * 获取原始Redis实例
   */
  public get redis() {
    return this.redisPub;
  }

  /**
   * 存储数据
   */
  public set(key: string, value: any): Promise<any> {
    this.debug("set %s=%j", key, value);
    const str = JSON.stringify(value);
    this.syncData.set(key, value);
    return this.redisPub
      .set(this.key(key), str)
      .then(() => this.publishSyncDataEvent(key, value))
      .then(() => value);
  }

  /**
   * 获取数据
   */
  public get(key: string, useCache: boolean = true): Promise<any> {
    if (useCache && this.syncData.has(key)) {
      return Promise.resolve(this.syncData.get(key));
    }
    return this.redisPub.get(this.key(key)).then(str => {
      if (!str) return;
      const data = JSON.parse(str);
      this.syncData.set(key, data);
      return data;
    }) as any;
  }

  /**
   * 删除数据
   */
  public delete(key: string): Promise<any> {
    this.debug("delete %s=%j", key);
    return this.redisPub.del(this.key(key)).then((ret: any) => {
      return this.publishSyncDataEvent(key, 0, true).then(() => {
        this.syncData.delete(key);
        return ret;
      });
    });
  }

  /**
   * 获取数据（同步），如果不存本地则返回undefined
   */
  public getSync(key: string): any {
    return this.syncData.get(key);
  }

  /**
   * 数值自增
   * @param key
   * @param increment
   */
  public incr(key: string, increment: number = 1): Promise<number> {
    this.debug("incr %s", key);
    return this.redisPub.incrby(this.key(key), increment).then((value: any) => {
      value = Number(value);
      this.syncData.set(key, value);
      return this.publishSyncDataEvent(key, value).then(() => value);
    }) as any;
  }

  /**
   * 数值自减
   * @param key
   * @param increment
   */
  public decr(key: string, increment: number = 1): Promise<number> {
    this.debug("decr %s %s", key, increment);
    return this.incr(key, -increment);
  }

  /**
   * 获取指定规则key列表的和值（可能有性能问题，慎用）
   * @param pattern 比如：abc:*
   */
  public sum(pattern: string): Promise<number> {
    return this.redisPub
      .keys(this.key(pattern))
      .then(keys => this.redis.mget(...keys))
      .then((values: any[]) => {
        if (values.length < 1) return 0;
        return values.map(v => Number(v)).reduce((a, b) => a + b);
      }) as any;
  }

  /**
   * 同步获取指定规则key列表的和值
   * @param pattern 规则，比如：abc:*
   */
  public sumSync(pattern: string): number {
    const reg = parseKeyPattern(pattern);
    const list = Array.from(this.syncData.entries()).filter(([k, v]) => {
      reg.lastIndex = 0;
      return reg.test(k);
    });
    if (list.length < 1) return 0;
    return list.map(([k, v]) => Number(v)).reduce((a, b) => a + b);
  }

  /**
   * 获取指定规则Key列表（可能有性能问题，慎用）
   * @param pattern 规则，比如：abc:*
   */
  public keys(pattern: string): Promise<string[]> {
    return this.redis
      .keys(this.key(pattern))
      .then(keys => keys.map(k => this.stripKeyPrefix(k)).sort()) as any;
  }

  /**
   * 获取指定规则Key列表
   * @param pattern 规则，比如：abc:*
   */
  public keysSync(pattern: string): string[] {
    const reg = parseKeyPattern(pattern);
    return Array.from(this.syncData.keys()).filter(k => {
      reg.lastIndex = 0;
      return reg.test(k);
    });
  }

  /**
   * 监听指定规则值的变化
   * @param pattern 规则，比如：abc:*
   * @param handler 处理函数
   */
  public watch(pattern: string, handler: WatchHandler): this {
    this.debug("watch: pattern=%s handler=%s", pattern, handler);
    if (!this.watchPatterns.has(pattern)) {
      const reg = parseKeyPattern(pattern);
      this.watchPatterns.set(pattern, reg);
    }
    this.event.on(`watch ${pattern}`, handler);
    return this;
  }

  /**
   * 取消监听指定规则变化
   * @param pattern 规则，比如：abc:*
   */
  public unwatch(pattern: string): this {
    this.debug("unwatch: pattern=%s", pattern);
    this.watchPatterns.delete(pattern);
    this.event.removeAllListeners(`watch ${pattern}`);
    return this;
  }
}

/**
 * 正则表达式转义
 * @param str
 */
function escapeString(str: string): string {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}

/**
 * 将Key规则转换为正则表达式
 * @param pattern
 */
function parseKeyPattern(pattern: string): RegExp {
  const s = "^" + escapeString(pattern).replace(/\\\*/g, "(.*)") + "$";
  return new RegExp(s, "g");
}

export default SharedData;
