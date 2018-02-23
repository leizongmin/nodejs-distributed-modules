# 分布式事件监听触发模块 @leizm/distributed-events

## 安装

```bash
npm install @leizm/distributed-events --save
```

## 使用

```typescript
import EventEmitter from "@leizm/distributed-events";

async function main() {
  // 创建实例
  const e = new EventEmitter({
    // Redis连接配置
    redis: {
      host: "127.0.0.1",
      port: 6379,
      password: "",
      db: 0
    },
    // 键前缀，默认空
    keyPrefix: "",
    // 频道名称，默认为"events"，如果设置了前缀则会加上前缀
    channelKey: "events"
  });

  // 等待初始化完成
  await e.ready();

  // 注册事件监听
  e.on("say hello", function(msg) {
    console.log("say: %s", msg);
  });

  // 触发事件
  e.emit("say hello", "hahahahaha");

  // 监听私人消息
  e.onPrivate(function(senderId, msg) {
    console.log("from %s: %s", senderId, msg);
  });

  // 发送私人消息
  e.sendPrivate(id, msg);
}
```

## License

```text
MIT License

Copyright (c) 2018 Zongmin Lei <leizongmin@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
