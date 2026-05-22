"use client";

import { motion, PanInfo, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Assignee, Item } from "@/lib/types";
import { nextAssignee } from "@/lib/store";
import { formatMoney } from "@/lib/splitter";

const THRESHOLD = 70;

type Props = {
  item: Item;
  currency: string;
  onSwipe: (direction: "left" | "right") => void;
  onEditName: (name: string) => void;
  onEditPrice: (price: number) => void;
};

type UnderlayState = {
  side: "left" | "right";
  color: "assign" | "unassign";
  label: string;
} | null;

function underlayFor(current: Assignee, offset: number): UnderlayState {
  if (Math.abs(offset) < 4) return null;
  const dir = offset < 0 ? "left" : "right";
  const target = nextAssignee(current, dir);
  if (target === current) return null;

  // Visible side is opposite the drag direction.
  const side = dir === "left" ? "right" : "left";
  if (target === null) {
    return { side, color: "unassign", label: "Unassign" };
  }
  return {
    side,
    color: "assign",
    label: target === "you" ? "→ You" : "Them ←",
  };
}

export function SwipeableRow({
  item,
  currency,
  onSwipe,
  onEditName,
  onEditPrice,
}: Props) {
  const x = useMotionValue(0);
  const [underlay, setUnderlay] = useState<UnderlayState>(null);
  const [editing, setEditing] = useState<"name" | "price" | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const draggedRef = useRef(false);

  const startEditName = () => {
    if (draggedRef.current) return;
    setNameDraft(item.name);
    setEditing("name");
  };
  const startEditPrice = () => {
    if (draggedRef.current) return;
    setPriceDraft(item.price.toFixed(2));
    setEditing("price");
  };

  useEffect(() => {
    if (editing === "name") nameInputRef.current?.select();
    if (editing === "price") priceInputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    const unsub = x.on("change", (v) => setUnderlay(underlayFor(item.assignee, v)));
    return unsub;
  }, [x, item.assignee]);

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > THRESHOLD) {
      const dir = info.offset.x < 0 ? "left" : "right";
      onSwipe(dir);
    }
    x.set(0);
    setUnderlay(null);
    // Defer so onTap (from press) doesn't fire if we just dragged.
    setTimeout(() => (draggedRef.current = false), 50);
  };

  const isAssigned = item.assignee !== null;

  const rowBg = isAssigned ? "bg-assign-bg" : "bg-card";
  const rowBorder = isAssigned ? "border-assign-border" : "border-border";

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== item.name) onEditName(trimmed);
    setEditing(null);
  };
  const commitPrice = () => {
    const parsed = parseFloat(priceDraft.replace(",", "."));
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed !== item.price) {
      onEditPrice(Math.round(parsed * 100) / 100);
    }
    setEditing(null);
  };

  // Underlay colors
  const underlayBg =
    underlay?.color === "unassign"
      ? "bg-[color:var(--warn)]"
      : "bg-[color:var(--action)]";

  return (
    <div className="relative">
      {underlay && (
        <div
          className={`absolute inset-0 rounded-2xl flex items-center px-5 ${underlayBg}`}
          style={{ justifyContent: underlay.side === "right" ? "flex-end" : "flex-start" }}
        >
          <span className="text-white font-bold text-sm">{underlay.label}</span>
        </div>
      )}
      <motion.div
        layout
        drag={editing ? false : "x"}
        dragConstraints={{ left: -160, right: 160 }}
        dragElastic={0.15}
        dragMomentum={false}
        style={{ x }}
        onDragStart={() => (draggedRef.current = true)}
        onDragEnd={handleDragEnd}
        className={`relative rounded-2xl ${rowBg} border ${rowBorder} h-14 flex items-center px-4 touch-pan-y select-none`}
      >
        {editing === "name" ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setEditing(null);
            }}
            className="flex-1 text-[15px] font-semibold bg-transparent"
          />
        ) : (
          <button
            type="button"
            onClick={startEditName}
            className="flex-1 text-left text-[15px] font-semibold truncate"
          >
            {item.name}
          </button>
        )}

        {editing === "price" ? (
          <input
            ref={priceInputRef}
            inputMode="decimal"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitPrice();
              if (e.key === "Escape") setEditing(null);
            }}
            className="w-24 text-right text-[15px] font-bold bg-transparent"
          />
        ) : (
          <button
            type="button"
            onClick={startEditPrice}
            className="text-[15px] font-bold ml-3 tabular-nums"
          >
            {formatMoney(item.price, currency)}
          </button>
        )}
      </motion.div>
    </div>
  );
}
