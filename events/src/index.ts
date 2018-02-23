/**
 * @leizm/distributed-events
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import * as events from "events";
import * as Redis from "ioredis";
import * as createDebug from "debug";

export interface Options {
  /** Redis连接配置 */
  redis?: Redis.RedisOptions;
  /** 键前缀，默认空 */
  keyPrefix?: string;
  /** 频道名称，默认为"events"，如果设置了前缀则会加上前缀 */
  channelKey?: string;
  /** 自定义ID，用于唯一标识当前客户端 */
  id?: string;
}

export const COUNTER_SYMBOL = Symbol("counter");
export const READY_EVENT_SYMBOL = Symbol("ready event");
export const PRIVATE_EVENT_SYMBOL = Symbol("private event");

export class EventEmitter {
  protected static [COUNTER_SYMBOL]: number = 0;

  public readonly id: string;

  protected readonly debug: debug.IDebugger;
  protected readonly event: events.EventEmitter = new events.EventEmitter();
  protected readonly channelKey: string;
  protected readonly privateChannelKey: string;
  protected readonly redisSub: Redis.Redis;
  protected readonly redisPub: Redis.Redis;
  protected isReady: boolean = false;
  protected isPrivateReady: boolean = false;

  constructor(options?: Options) {
    options = options || {};
    EventEmitter[COUNTER_SYMBOL]++;
    this.debug = createDebug(
      `@leizm:distributed-events:#${EventEmitter[COUNTER_SYMBOL]}`
    );

    this.id =
      options.id ||
      `${Date.now()}.${process.pid}.${Math.floor(Math.random() * 1000000)}`;

    this.channelKey = options.channelKey || "events";
    if (options.keyPrefix) {
      this.channelKey = options.keyPrefix + this.channelKey;
    }
    this.privateChannelKey = this.getPrivateChannelKey(this.id);

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
        // 触发事件
        let data: {
          e: string;
          a: any;
        };
        try {
          data = JSON.parse(str);
        } catch (err) {
          this.debug("events => JSON.parse %s", err);
          return;
        }
        this.event.emit(data.e, ...data.a);
      } else if (ch === this.privateChannelKey) {
        // 私人消息
        let data: {
          i: string;
          a: any;
        };
        try {
          data = JSON.parse(str);
        } catch (err) {
          this.debug("private => JSON.parse %s", err);
          return;
        }
        this.event.emit(PRIVATE_EVENT_SYMBOL, data.i, ...data.a);
      }
    });
    this.redisSub.subscribe(this.channelKey, () => {
      this.debug("redisSub.subscribe.ready events");
      this.isReady = true;
      this.checkReady();
    });
    this.redisSub.subscribe(this.privateChannelKey, () => {
      this.debug("redisSub.subscribe.ready private");
      this.isPrivateReady = true;
      this.checkReady();
    });

    this.redisPub = new Redis(options.redis);
    if (options.redis && options.redis.db) {
      this.redisPub.select(options.redis.db);
    }
    this.redisPub.on("error", err => {
      this.debug("redisPub.on(error) => %s", err);
      this.event.emit("error", err);
    });
  }

  /**
   * 获取私人频道Key
   * @param id
   */
  protected getPrivateChannelKey(id: string): string {
    return `${this.channelKey}:${id}`;
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
   * 触发事件
   * @param event 事件名称
   * @param args 参数
   */
  public emit(event: string, ...args: any[]): this {
    this.redisPub.publish(
      this.channelKey,
      JSON.stringify({ e: event, a: args })
    );
    return this;
  }

  /**
   * 监听私人消息
   * @param listener 回调函数
   */
  public onPrivate(listener: (senderId: string, ...args: any[]) => void): this {
    this.event.on(PRIVATE_EVENT_SYMBOL, listener);
    return this;
  }

  /**
   * 发送私人消息
   * @param receiverId 接收者ID
   * @param data 数据
   */
  public sendPrivate(receiverId: string, ...args: any[]): this {
    this.redisPub.publish(
      this.getPrivateChannelKey(receiverId),
      JSON.stringify({ i: this.id, a: args })
    );
    return this;
  }

  /**
   * 检查是否就绪
   */
  protected checkReady() {
    if (this.isReady && this.isPrivateReady) {
      this.event.emit(READY_EVENT_SYMBOL);
    }
  }

  /**
   * 等待就绪
   */
  public ready(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isReady && this.isPrivateReady) return resolve();
      this.event.once(READY_EVENT_SYMBOL, resolve);
    });
  }

  /**
   * 销毁
   */
  public destroy() {
    this.redisPub.disconnect();
    this.redisSub.disconnect();
  }
}

export default EventEmitter;
