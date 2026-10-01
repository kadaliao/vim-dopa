# Vim 多巴闯关

**在线玩：<https://vim-dopa.vercel.app>**

用真实 Vim 按键闯关的浏览器小游戏。每一关是一个小编辑任务：把光标移到目标位置，或把文本改成目标的样子。按对一步，音乐多一层，画面更热闹。没有 Game Over，卡住了随时看提示。

玩法和演出节奏参考了 [grmchn/dopa-drill](https://github.com/grmchn/dopa-drill)（算数版的“越解越嗨”计算练习）。本项目的代码、关卡和角色都是独立编写的。

## 特点

- 14 章 79 关：hjkl、单词跳跃、行首行尾、f/t 行内查找、插入模式、删除、修改、文本对象、复制粘贴、`.` 重复、搜索、可视模式、`:s` / `:g` 命令行，最后是组合技 Boss 关
- 章节按前置关系解锁，关卡地图画出技能树
- 每关有参考解，它的按键数就是标准：不超过标准 3 星，比参考解更短会触发“超越参考解！”
- 多巴值按对数增长，连续 3 星有连击加成；音乐（Web Audio 实时合成，没有音频文件）和背景特效随多巴值分 7 档叠加
- 吉祥物“光标仔”会跟着节拍晃动，颜色随模式变化：NORMAL 粉、INSERT 蓝、VISUAL 紫
- 记录只存在浏览器的 localStorage 里，不上传任何数据

## 内置的 Vim 子集

`js/vim.js` 是一个不依赖 DOM 的小引擎，支持：

- 计数，`h j k l w b e W B E 0 ^ $ gg G f F t T ; , { } % n N * # + -`
- 操作符 `d c y > < gu gU g~`，可配动作或文本对象 `iw aw iW aW i" a" i' a' i( a( i[ a[ i{ a{ i< a< ip ap`
- `x X s S r D C Y J ~ p P i a I A o O u Ctrl-r .`，`v V`，`/ ?`
- Ex：`:N`、`:s`、`:%s`、`:'<,'>s`、`:g/pat/d`、`:v/pat/d`、`:d`
- 固定选项：`shiftwidth=4`，开启 autoindent

不支持宏、标记、命名寄存器、块选择。

## 本地运行

不需要构建，静态托管 `index.html` 和 `js/` 即可。因为用了 ES Modules，不能直接用 `file://` 打开：

```bash
python3 -m http.server 8000
```

然后打开 `http://localhost:8000/`。需要实体键盘和英文输入法；手机上有 Esc / ⌫ / ↵ 辅助按钮。

## 测试

需要 Node.js 20 或更高版本。测试会逐键回放每一关的参考解，并检查引擎的细节行为：

```bash
node --test tests/*.test.mjs
```

## 添加关卡

关卡写在 `js/levels.js`。`buf` 里的 `▮` 表示光标起点，`◎` 表示目标位置；写了 `want` 的关卡以文本为目标。`sol` 是参考解，按键数就是标准。新增关卡后运行测试，确认参考解能解开、且不会提前解开。

## 许可

MIT
