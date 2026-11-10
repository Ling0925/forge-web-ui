import {
  CheckCircle,
  Copy,
  DotsThree,
  GearSix,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { Badge } from "#ui/badge";
import { Button } from "#ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#ui/card";
import { Checkbox } from "#ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "#ui/dropdown-menu";
import { Input } from "#ui/input";
import { Kbd, KbdGroup } from "#ui/kbd";
import { Label } from "#ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select";
import { Separator } from "#ui/separator";
import { Skeleton } from "#ui/skeleton";
import { Switch } from "#ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#ui/tabs";
import { Textarea } from "#ui/textarea";
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "#ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#ui/tooltip";

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-2xs text-muted-foreground tracking-wide">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Static gallery: open overlays must not steal focus or scroll the page.
const preventFocus = (event: Event) => event.preventDefault();

/**
 * Gallery of the shadcn-style primitives in src/renderer/ui. Overlays render
 * inline and non-modal (open) so one static screenshot shows every state;
 * AlertDialog itself is always modal, so its panel is shown through Dialog.
 */
export function UiGallery() {
  const [follow, setFollow] = useState(true);
  const [commands, setCommands] = useState(false);
  const [agree, setAgree] = useState<boolean | "indeterminate">(true);
  return (
    <TooltipProvider>
      <ToastProvider duration={Number.POSITIVE_INFINITY}>
        <div
          data-slot="ui-gallery"
          className="grid gap-x-8 gap-y-7 bg-background p-6 font-sans text-foreground lg:grid-cols-2"
        >
          <Section title="按钮 · 变体">
            <div className="flex flex-wrap items-center gap-2">
              <Button>发送</Button>
              <Button variant="secondary">取消</Button>
              <Button variant="outline">
                <Copy />
                复制
              </Button>
              <Button variant="ghost">展开详情</Button>
              <Button variant="destructive">
                <Trash />
                删除记忆
              </Button>
              <Button variant="link">查看用量</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">小号</Button>
              <Button size="lg">发送并开始会话</Button>
              <Button loading>保存中</Button>
              <Button disabled variant="outline">
                不可用
              </Button>
              <Tooltip open>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" aria-label="新会话">
                    <Plus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" inline>
                  新会话 <Kbd className="ml-1 border-transparent">⌘N</Kbd>
                </TooltipContent>
              </Tooltip>
            </div>
          </Section>

          <Section title="输入框 · 普通 / 占位 / 错误 / 禁用">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="g-base">接口地址</Label>
                <Input id="g-base" defaultValue="https://api.example.com/v1" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="g-model">模型 ID</Label>
                <Input id="g-model" placeholder="例如 claude-sonnet-4.5" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="g-err">上下文窗口</Label>
                <Input
                  id="g-err"
                  aria-invalid
                  aria-describedby="g-err-msg"
                  defaultValue="0"
                />
                <p id="g-err-msg" className="text-2xs text-destructive">
                  保存失败：窗口必须大于 0
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="g-dis">工作目录</Label>
                <Input
                  id="g-dis"
                  disabled
                  defaultValue="/workspace/forge-web-ui"
                />
              </div>
            </div>
            <Textarea
              aria-label="任务输入"
              placeholder="Enter 发送，Shift+Enter 换行"
              rows={2}
            />
          </Section>

          <Section title="选择 · 复选 · 开关">
            <div className="flex flex-wrap items-center gap-3">
              <Select defaultValue="medium">
                <SelectTrigger className="w-44" aria-label="推理强度">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">推理 · 低</SelectItem>
                  <SelectItem value="medium">推理 · 中</SelectItem>
                  <SelectItem value="high">推理 · 高</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger
                  className="w-44"
                  aria-label="选择模型"
                  aria-invalid
                >
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">claude-sonnet-4.5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Label>
                <Checkbox checked={agree} onCheckedChange={setAgree} />
                只读规划
              </Label>
              <Label>
                <Checkbox checked="indeterminate" />
                部分工具
              </Label>
              <Label>
                <Checkbox disabled />
                不可用
              </Label>
              <Label>
                <Switch checked={follow} onCheckedChange={setFollow} />
                跟随系统主题
              </Label>
              <Label>
                <Switch checked={commands} onCheckedChange={setCommands} />
                允许执行系统命令
              </Label>
            </div>
          </Section>

          <Section title="徽标 · 快捷键 · 骨架">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">已完成</Badge>
              <Badge variant="info">运行中</Badge>
              <Badge variant="warning">待批准</Badge>
              <Badge variant="destructive">失败</Badge>
              <Badge variant="brand">Plan</Badge>
              <Badge variant="outline">只读</Badge>
              <Badge>默认</Badge>
              <Badge variant="secondary">归档</Badge>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground text-sm">
              <span className="inline-flex items-center gap-2">
                搜索会话
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
              </span>
              <span className="inline-flex items-center gap-2">
                插话 <Kbd>Alt+Enter</Kbd>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          </Section>

          <Section title="标签页 · 分隔">
            <Tabs defaultValue="general">
              <TabsList>
                <TabsTrigger value="general">通用</TabsTrigger>
                <TabsTrigger value="models">模型服务</TabsTrigger>
                <TabsTrigger value="reasoning">推理</TabsTrigger>
              </TabsList>
              <TabsContent
                value="general"
                className="text-muted-foreground text-sm"
              >
                跟随系统会随操作系统的浅色 / 深色切换。
              </TabsContent>
              <TabsContent
                value="models"
                className="text-muted-foreground text-sm"
              >
                在来源中添加模型后会自动迁移。
              </TabsContent>
              <TabsContent
                value="reasoning"
                className="text-muted-foreground text-sm"
              >
                适用于支持思考参数的模型。
              </TabsContent>
            </Tabs>
            <Tabs defaultValue="files">
              <TabsList variant="underline">
                <TabsTrigger value="files">文件</TabsTrigger>
                <TabsTrigger value="plan">计划</TabsTrigger>
                <TabsTrigger value="tasks">子任务</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex h-5 items-center gap-3 text-muted-foreground text-sm">
              <span>工作区</span>
              <Separator orientation="vertical" />
              <span>forge-web-ui</span>
              <Separator orientation="vertical" />
              <span>3 个会话</span>
            </div>
          </Section>

          <Section title="卡片 · 菜单">
            <div className="flex flex-wrap items-start gap-4">
              <Card className="w-72">
                <CardHeader>
                  <CardTitle>OFFLINE MOCK 来源</CardTitle>
                  <CardDescription>chat-completions · 4 个模型</CardDescription>
                  <CardAction>
                    <DropdownMenu open modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="来源操作"
                        >
                          <DotsThree />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onCloseAutoFocus={preventFocus}
                      >
                        <DropdownMenuLabel>来源</DropdownMenuLabel>
                        <DropdownMenuItem>
                          <PencilSimple />
                          编辑
                          <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <GearSix />
                          模型设置
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive>
                          <Trash />
                          删除来源
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardAction>
                </CardHeader>
                <CardContent className="text-sm">
                  <code className="font-mono text-muted-foreground text-xs">
                    https://fixture.invalid/v1
                  </code>
                </CardContent>
                <CardFooter>
                  <Badge variant="success">已连接</Badge>
                  <Button size="sm" variant="outline" className="ml-auto">
                    测试连接
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </Section>

          <Section title="对话框 · 确认框">
            <div className="grid gap-4 rounded-xl bg-overlay p-4">
              <Dialog open modal={false}>
                <DialogContent inline onOpenAutoFocus={preventFocus}>
                  <DialogHeader>
                    <DialogTitle>清除旧版窗口设置？</DialogTitle>
                    <DialogDescription>
                      这些模型将改用来源上报的窗口；未知模型按 300K 估算。
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">取消</Button>
                    <Button>清除</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open modal={false}>
                <DialogContent
                  inline
                  role="alertdialog"
                  showCloseButton={false}
                  className="max-w-md"
                  onOpenAutoFocus={preventFocus}
                >
                  <DialogHeader>
                    <DialogTitle>将默认权限设为无限制？</DialogTitle>
                    <DialogDescription>
                      新的运行将直接读写文件并执行终端命令，不再逐次请求批准；当前运行不受影响。
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">取消</Button>
                    <Button variant="destructive">设为无限制</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </Section>

          <Section title="Toast">
            <Toast open>
              <CheckCircle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-success"
              />
              <div className="grid flex-1 gap-0.5">
                <ToastTitle>已复制路径</ToastTitle>
                <ToastDescription>
                  src/renderer/components/workbench
                </ToastDescription>
              </div>
              <ToastAction altText="撤销复制">撤销</ToastAction>
              <ToastClose />
            </Toast>
            <Toast open variant="destructive">
              <div className="grid flex-1 gap-0.5">
                <ToastTitle>加入待发队列失败。</ToastTitle>
                <ToastDescription>
                  草稿已保留在输入框，可稍后重试。
                </ToastDescription>
              </div>
              <ToastClose />
            </Toast>
            <ToastViewport className="static w-full max-w-md p-0" />
          </Section>
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}
