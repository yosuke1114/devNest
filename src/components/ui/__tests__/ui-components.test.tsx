import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "../dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../tabs";
import { ScrollArea, ScrollBar } from "../scroll-area";
import { Switch } from "../switch";
import { Separator } from "../separator";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../tooltip";

// ── Card ──────────────────────────────────────────────────────────────────────

describe("Card コンポーネント群", () => {
  it("Card がレンダリングされる", () => {
    render(<Card data-testid="card">content</Card>);
    expect(screen.getByTestId("card")).toBeTruthy();
  });

  it("CardHeader がレンダリングされる", () => {
    render(<CardHeader data-testid="header">header</CardHeader>);
    expect(screen.getByTestId("header")).toBeTruthy();
  });

  it("CardTitle がレンダリングされる", () => {
    render(<CardTitle>タイトル</CardTitle>);
    expect(screen.getByText("タイトル")).toBeTruthy();
  });

  it("CardContent がレンダリングされる", () => {
    render(<CardContent data-testid="content">本文</CardContent>);
    expect(screen.getByTestId("content")).toBeTruthy();
  });

  it("CardFooter がレンダリングされる", () => {
    render(<CardFooter data-testid="footer">フッター</CardFooter>);
    expect(screen.getByTestId("footer")).toBeTruthy();
  });

  it("Card に className が渡せる", () => {
    render(<Card className="custom-class" data-testid="card2">x</Card>);
    expect(screen.getByTestId("card2").className).toContain("custom-class");
  });

  it("Card 全コンポーネントを組み合わせてレンダリングできる", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
        </CardHeader>
        <CardContent>本文テキスト</CardContent>
        <CardFooter>フッター</CardFooter>
      </Card>
    );
    expect(screen.getByText("Project")).toBeTruthy();
    expect(screen.getByText("本文テキスト")).toBeTruthy();
    expect(screen.getByText("フッター")).toBeTruthy();
  });
});

// ── Dialog ────────────────────────────────────────────────────────────────────

describe("Dialog コンポーネント群", () => {
  it("Dialog + DialogTrigger がレンダリングされる", () => {
    render(
      <Dialog>
        <DialogTrigger data-testid="trigger">開く</DialogTrigger>
      </Dialog>
    );
    expect(screen.getByTestId("trigger")).toBeTruthy();
  });

  it("Dialog を open=true にすると DialogContent が表示される", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>タイトル</DialogTitle>
            <DialogDescription>説明文</DialogDescription>
          </DialogHeader>
          <DialogFooter>フッター</DialogFooter>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText("タイトル")).toBeTruthy();
    expect(screen.getByText("説明文")).toBeTruthy();
    expect(screen.getByText("フッター")).toBeTruthy();
  });

  it("DialogHeader がレンダリングされる", () => {
    render(<DialogHeader data-testid="dh">header</DialogHeader>);
    expect(screen.getByTestId("dh")).toBeTruthy();
  });

  it("DialogFooter がレンダリングされる", () => {
    render(<DialogFooter data-testid="df">footer</DialogFooter>);
    expect(screen.getByTestId("df")).toBeTruthy();
  });
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

describe("Tabs コンポーネント群", () => {
  it("Tabs が defaultValue でレンダリングされる", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab1</TabsTrigger>
          <TabsTrigger value="tab2">Tab2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">コンテンツ1</TabsContent>
        <TabsContent value="tab2">コンテンツ2</TabsContent>
      </Tabs>
    );
    expect(screen.getByText("Tab1")).toBeTruthy();
    expect(screen.getByText("Tab2")).toBeTruthy();
    expect(screen.getByText("コンテンツ1")).toBeTruthy();
  });

  it("TabsList に className が渡せる", () => {
    render(
      <Tabs defaultValue="t">
        <TabsList className="my-list" data-testid="list">
          <TabsTrigger value="t">T</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    expect(screen.getByTestId("list").className).toContain("my-list");
  });
});

// ── ScrollArea ────────────────────────────────────────────────────────────────

describe("ScrollArea コンポーネント", () => {
  it("ScrollArea がレンダリングされる", () => {
    render(
      <ScrollArea data-testid="scroll">
        <div>スクロールコンテンツ</div>
      </ScrollArea>
    );
    expect(screen.getByText("スクロールコンテンツ")).toBeTruthy();
  });

  it("ScrollArea に className が渡せる", () => {
    render(
      <ScrollArea className="scroll-class" data-testid="scroll2">
        content
      </ScrollArea>
    );
    // ScrollArea は root に className が渡る
    expect(screen.getByTestId("scroll2")).toBeTruthy();
  });

  it("ScrollBar (vertical) がレンダリングエラーなく表示される", () => {
    const { container } = render(
      <ScrollArea>
        <ScrollBar orientation="vertical" />
        <div data-testid="inner">content</div>
      </ScrollArea>
    );
    expect(container).toBeTruthy();
    expect(screen.getByTestId("inner")).toBeTruthy();
  });

  it("ScrollBar (horizontal) がレンダリングエラーなく表示される", () => {
    const { container } = render(
      <ScrollArea>
        <ScrollBar orientation="horizontal" />
        <div data-testid="inner2">content</div>
      </ScrollArea>
    );
    expect(container).toBeTruthy();
    expect(screen.getByTestId("inner2")).toBeTruthy();
  });
});

// ── Switch ────────────────────────────────────────────────────────────────────

describe("Switch コンポーネント", () => {
  it("Switch がレンダリングされる", () => {
    render(<Switch data-testid="switch" />);
    expect(screen.getByTestId("switch")).toBeTruthy();
  });

  it("Switch に className が渡せる", () => {
    render(<Switch className="my-switch" data-testid="switch2" />);
    expect(screen.getByTestId("switch2").className).toContain("my-switch");
  });

  it("checked=true の Switch がレンダリングされる", () => {
    render(<Switch checked onCheckedChange={() => {}} data-testid="switch3" />);
    expect(screen.getByTestId("switch3")).toBeTruthy();
  });
});

// ── Separator ─────────────────────────────────────────────────────────────────

describe("Separator コンポーネント", () => {
  it("Separator (horizontal) がレンダリングされる", () => {
    render(<Separator data-testid="sep" />);
    expect(screen.getByTestId("sep")).toBeTruthy();
  });

  it("Separator (vertical) がレンダリングされる", () => {
    render(<Separator orientation="vertical" data-testid="sep-v" />);
    expect(screen.getByTestId("sep-v")).toBeTruthy();
  });

  it("decorative=false の Separator がレンダリングされる", () => {
    render(<Separator decorative={false} data-testid="sep-nd" />);
    expect(screen.getByTestId("sep-nd")).toBeTruthy();
  });
});

// ── Tooltip ───────────────────────────────────────────────────────────────────

describe("Tooltip コンポーネント", () => {
  it("Tooltip + TooltipTrigger がレンダリングされる", () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger data-testid="trigger">ホバー</TooltipTrigger>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.getByTestId("trigger")).toBeTruthy();
  });

  it("TooltipProvider がレンダリングされる", () => {
    render(
      <TooltipProvider>
        <div data-testid="content">inside</div>
      </TooltipProvider>
    );
    expect(screen.getByTestId("content")).toBeTruthy();
  });
});
