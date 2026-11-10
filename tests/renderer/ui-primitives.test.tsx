import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "#ui/alert-dialog";
import { Badge, badgeVariants } from "#ui/badge";
import { Button, buttonVariants } from "#ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#ui/card";
import { Checkbox } from "#ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "#ui/dialog";
import { Input } from "#ui/input";
import { Kbd } from "#ui/kbd";
import { Label } from "#ui/label";
import { MotionProvider } from "#ui/motion-provider";
import { Select, SelectTrigger, SelectValue } from "#ui/select";
import { Separator } from "#ui/separator";
import { Switch } from "#ui/switch";
import { Tabs, TabsList, TabsTrigger } from "#ui/tabs";
import { Textarea } from "#ui/textarea";
import { toastVariants } from "#ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#ui/tooltip";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(node);

describe("Button", () => {
  it("defaults to a non-submitting primary button", () => {
    const out = html(<Button>发送</Button>);
    expect(out).toContain('type="button"');
    expect(out).toContain('data-slot="button"');
    expect(out).toContain("bg-primary");
    expect(out).toContain("text-primary-foreground");
  });

  it("maps every variant to semantic tokens only", () => {
    expect(buttonVariants({ variant: "destructive" })).toContain(
      "bg-destructive",
    );
    expect(buttonVariants({ variant: "outline" })).toContain("border-input");
    expect(buttonVariants({ variant: "ghost" })).toContain(
      "hover:not-disabled:bg-accent",
    );
    expect(buttonVariants({ variant: "secondary" })).toContain("bg-secondary");
    for (const variant of [
      "default",
      "secondary",
      "outline",
      "ghost",
      "destructive",
      "link",
    ] as const) {
      expect(buttonVariants({ variant })).not.toMatch(
        /#[0-9a-f]{3,8}\b|\[(?:rgb|oklch)/i,
      );
    }
  });

  it("lets callers override conflicting utilities through cn", () => {
    const out = html(<Button className="px-6">保存</Button>);
    expect(out).toContain("px-6");
    expect(out).not.toMatch(/\bpx-3\b/);
  });

  it("marks loading buttons busy and disabled while keeping the label", () => {
    const out = html(<Button loading>保存中</Button>);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("disabled");
    expect(out).toContain('data-slot="spinner"');
    expect(out).toContain("保存中");
  });

  it("renders the child element with asChild", () => {
    const out = html(
      <Button asChild variant="link">
        <a href="#usage">查看用量</a>
      </Button>,
    );
    expect(out).toMatch(/^<a /);
    expect(out).toContain('href="#usage"');
    expect(out).not.toContain("<button");
  });
});

describe("form controls", () => {
  it("Input and Textarea share the field chrome and expose invalid state", () => {
    const input = html(<Input aria-invalid defaultValue="0" />);
    expect(input).toContain('type="text"');
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain("aria-invalid:border-destructive");
    expect(input).toContain("focus-visible:border-ring");
    const textarea = html(<Textarea placeholder="Enter 发送" />);
    expect(textarea).toContain('data-slot="textarea"');
    expect(textarea).toContain("border-input");
  });

  it("Switch and Checkbox keep their ARIA roles and states", () => {
    expect(html(<Switch checked aria-label="跟随系统" />)).toMatch(
      /role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/,
    );
    const mixed = html(
      <Checkbox checked="indeterminate" aria-label="部分工具" />,
    );
    expect(mixed).toContain('role="checkbox"');
    expect(mixed).toContain('aria-checked="mixed"');
  });

  it("Label associates with its control", () => {
    const out = html(<Label htmlFor="model">模型 ID</Label>);
    expect(out).toMatch(/<label[^>]*for="model"/);
  });

  it("Select trigger is a combobox showing the placeholder", () => {
    const out = html(
      <Select>
        <SelectTrigger aria-label="选择模型">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
      </Select>,
    );
    expect(out).toContain('role="combobox"');
    expect(out).toContain("选择模型");
    expect(out).toContain('data-size="default"');
  });
});

describe("display primitives", () => {
  it("Badge variants use the tinted state tokens", () => {
    expect(badgeVariants({ variant: "success" })).toContain(
      "bg-success-soft text-success",
    );
    expect(badgeVariants({ variant: "warning" })).toContain(
      "bg-warning-soft text-warning",
    );
    expect(badgeVariants({ variant: "info" })).toContain(
      "bg-info-soft text-info",
    );
    expect(badgeVariants({ variant: "destructive" })).toContain(
      "text-destructive",
    );
    expect(html(<Badge variant="brand">Plan</Badge>)).toContain("text-brand");
  });

  it("Card, Kbd and Separator render their slots", () => {
    const card = html(
      <Card>
        <CardHeader>
          <CardTitle>来源</CardTitle>
        </CardHeader>
        <CardContent>内容</CardContent>
      </Card>,
    );
    expect(card).toContain('data-slot="card"');
    expect(card).toContain('data-slot="card-title"');
    expect(html(<Kbd>⌘K</Kbd>)).toMatch(/^<kbd [^>]*data-slot="kbd"/);
    const separator = html(<Separator orientation="vertical" />);
    expect(separator).toContain('data-orientation="vertical"');
    expect(separator).toContain('role="none"');
  });

  it("toast variants tint only the border", () => {
    expect(toastVariants({ variant: "destructive" })).toContain(
      "border-error-border",
    );
    expect(toastVariants()).toContain("border-border");
  });
});

describe("overlays", () => {
  it("Dialog renders title, description and a labelled close button", () => {
    const out = html(
      <Dialog open>
        <DialogContent inline>
          <DialogTitle>清除旧版窗口设置？</DialogTitle>
          <DialogDescription>未知模型按 300K 估算。</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    // Radix links aria-labelledby/-describedby after mount; server markup
    // carries the role and the ids those attributes point at.
    expect(out).toContain('role="dialog"');
    expect(out).toMatch(/<h2 id="[^"]+"[^>]*data-slot="dialog-title"/);
    expect(out).toMatch(/<p id="[^"]+"[^>]*data-slot="dialog-description"/);
    expect(out).toContain('aria-label="关闭"');
    expect(out).not.toMatch(/class="[^"]*\bfixed\b/);
  });

  it("Dialog can drop the corner close button", () => {
    const out = html(
      <Dialog open>
        <DialogContent inline showCloseButton={false}>
          <DialogTitle>标题</DialogTitle>
          <DialogDescription>说明</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(out).not.toContain('aria-label="关闭"');
  });

  it("AlertDialog renders an alertdialog with cancel and a destructive action", () => {
    const out = html(
      <AlertDialog open>
        <AlertDialogContent inline>
          <AlertDialogTitle>将默认权限设为无限制？</AlertDialogTitle>
          <AlertDialogDescription>当前运行不受影响。</AlertDialogDescription>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction destructive>设为无限制</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(out).toContain('role="alertdialog"');
    expect(out).toContain("取消");
    expect(out).toMatch(/class="[^"]*bg-destructive[^"]*"[^>]*>设为无限制/);
  });

  it("Tooltip content renders inline when open", () => {
    const out = html(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>新会话</TooltipTrigger>
          <TooltipContent inline>新会话 ⌘N</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(out).toContain('data-slot="tooltip-content"');
    expect(out).toContain("新会话 ⌘N");
  });
});

describe("Tabs + motion", () => {
  it("draws the shared indicator only inside the active trigger", () => {
    const out = html(
      <MotionProvider>
        <Tabs defaultValue="models">
          <TabsList>
            <TabsTrigger value="general">通用</TabsTrigger>
            <TabsTrigger value="models">模型服务</TabsTrigger>
          </TabsList>
        </Tabs>
      </MotionProvider>,
    );
    expect(out.match(/data-slot="tabs-indicator"/g)).toHaveLength(1);
    const active =
      out.match(/<button[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/)?.[1] ??
      "";
    expect(active).toContain("tabs-indicator");
    expect(active).toContain("模型服务");
  });

  it("underline tabs use the brand indicator", () => {
    const out = html(
      <Tabs value="plan">
        <TabsList variant="underline">
          <TabsTrigger value="files">文件</TabsTrigger>
          <TabsTrigger value="plan">计划</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(out).toContain('data-variant="underline"');
    expect(out).toContain("bg-brand");
  });
});
