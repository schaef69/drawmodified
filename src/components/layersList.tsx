import { useAtom } from 'jotai';
import { useState } from 'react';
import { AppDrawings, AppState } from '../jotai';
import { CanvasItem } from '../types';
import History from '../lib/history';
import { deleteItem } from '../lib/utils';

export default function LayersList() {
  const [items, setItems] = useAtom(AppDrawings);
  const [main, setAppState] = useAtom(AppState);
  const [collapsed, setCollapsed] = useState(false);

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{
    id: string;
    position: 'above' | 'below';
  } | null>(null);

  function toggleVisibility(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const targetItem = items.find((i) => i.id === id);
    if (!targetItem) return;

    const nextVisible = targetItem.visible === false ? true : false;
    const updated = items.map((item) =>
      item.id === id ? { ...item, visible: nextVisible } : item
    );

    // If making hidden, deselect if selected
    if (!nextVisible) {
      if (main.selectedItemID === id) {
        setAppState({ ...main, selectedItemID: '' });
      } else if (main.multipleSelections.includes(id)) {
        setAppState({
          ...main,
          multipleSelections: main.multipleSelections.filter((sId) => sId !== id),
        });
      }
    }

    setItems(updated);
    localStorage.setItem('canvasItems', JSON.stringify(updated));
    History.addHistory(updated);
  }

  function handleSelectLayer(item: CanvasItem) {
    // If hidden, unhide it and select so user can see what they selected
    if (item.visible === false) {
      const updated = items.map((i) =>
        i.id === item.id ? { ...i, visible: true } : i
      );
      setItems(updated);
      localStorage.setItem('canvasItems', JSON.stringify(updated));
      History.addHistory(updated);
    }

    setAppState({
      ...main,
      selectedItemID: item.id,
      multipleSelections: [],
      tool: 'select',
    });
  }

  function moveLayer(id: string, direction: 'up' | 'down', e: React.MouseEvent) {
    e.stopPropagation();
    const index = items.findIndex((i) => i.id === id);
    if (index === -1) return;

    const newItems = [...items];
    if (direction === 'up' && index < items.length - 1) {
      // Move up towards top of canvas (higher index)
      const temp = newItems[index];
      newItems[index] = newItems[index + 1];
      newItems[index + 1] = temp;
    } else if (direction === 'down' && index > 0) {
      // Move down towards bottom of canvas (lower index)
      const temp = newItems[index];
      newItems[index] = newItems[index - 1];
      newItems[index - 1] = temp;
    } else {
      return;
    }

    setItems(newItems);
    localStorage.setItem('canvasItems', JSON.stringify(newItems));
    History.addHistory(newItems);
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const newItems = deleteItem(id, items);
    if (main.selectedItemID === id) {
      setAppState({ ...main, selectedItemID: '' });
    } else if (main.multipleSelections.includes(id)) {
      setAppState({
        ...main,
        multipleSelections: main.multipleSelections.filter((sId) => sId !== id),
      });
    }
    setItems(newItems);
    localStorage.setItem('canvasItems', JSON.stringify(newItems));
    History.addHistory(newItems);
  }

  function toggleAllVisibility() {
    const anyHidden = items.some((i) => i.visible === false);
    const newItems = items.map((i) => ({ ...i, visible: anyHidden }));
    if (!anyHidden) {
      // All are being hidden -> clear selections
      setAppState({ ...main, selectedItemID: '', multipleSelections: [] });
    }
    setItems(newItems);
    localStorage.setItem('canvasItems', JSON.stringify(newItems));
    History.addHistory(newItems);
  }

  // Drag and Drop handlers
  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedId(id);
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedId || draggedId === targetId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'above' | 'below' = e.clientY < midY ? 'above' : 'below';

    if (
      !dragOverInfo ||
      dragOverInfo.id !== targetId ||
      dragOverInfo.position !== position
    ) {
      setDragOverInfo({ id: targetId, position });
    }
  }

  function handleDragLeave(e: React.DragEvent, targetId: string) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverInfo?.id === targetId) {
        setDragOverInfo(null);
      }
    }
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();

    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverInfo(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'above' | 'below' = e.clientY < midY ? 'above' : 'below';

    // The visual list is top-to-bottom ([...items].reverse())
    const visualList = [...items].reverse();
    const reorderedVisualList = reorderVisualList(
      visualList,
      draggedId,
      targetId,
      position
    );
    // Reverse back to canvas bottom-to-top order
    const newCanvasItems = [...reorderedVisualList].reverse();

    setItems(newCanvasItems);
    localStorage.setItem('canvasItems', JSON.stringify(newCanvasItems));
    History.addHistory(newCanvasItems);

    setDraggedId(null);
    setDragOverInfo(null);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverInfo(null);
  }

  // Visual top of list = top of canvas (highest array index)
  const reversedLayers = [...items]
    .map((item, idx) => ({ item, originalIndex: idx }))
    .reverse();

  return (
    <div className="bg-[var(--background)] mx-3 my-3 p-3 rounded shadow border border-[var(--accents-2)] flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs font-semibold text-[var(--accents-7)] select-none">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 hover:text-[var(--accents-8)] focus:outline-none"
        >
          <span
            className="text-[10px] transform transition-transform"
            style={{
              display: 'inline-block',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            }}
          >
            ▼
          </span>
          <span>Layers</span>
          <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-[var(--accents-2)] text-[var(--accents-6)]">
            {items.length}
          </span>
        </button>

        {items.length > 0 && !collapsed && (
          <button
            type="button"
            onClick={toggleAllVisibility}
            title={
              items.some((i) => i.visible === false)
                ? 'Show all layers'
                : 'Hide all layers'
            }
            className="text-[11px] text-[var(--accents-5)] hover:text-[var(--accents-8)] px-1 rounded hover:bg-[var(--accents-2)]"
          >
            {items.some((i) => i.visible === false) ? 'Show All' : 'Hide All'}
          </button>
        )}
      </div>

      {!collapsed && (
        <div
          className="max-h-56 overflow-y-auto flex flex-col gap-1 pr-0.5"
          style={{ scrollbarWidth: 'thin' }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOverInfo(null);
            }
          }}
        >
          {reversedLayers.length === 0 ? (
            <div className="text-[11px] text-[var(--accents-4)] italic py-3 text-center select-none">
              No layers yet
            </div>
          ) : (
            reversedLayers.map(({ item, originalIndex }) => {
              const isSelected =
                main.selectedItemID === item.id ||
                main.multipleSelections.includes(item.id);
              const isHidden = item.visible === false;
              const isAtTop = originalIndex === items.length - 1;
              const isAtBottom = originalIndex === 0;

              const isDragging = draggedId === item.id;
              const isDropTarget = dragOverInfo?.id === item.id;
              const dropPosition = isDropTarget ? dragOverInfo.position : null;

              return (
                <div
                  key={item.id}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDragLeave={(e) => handleDragLeave(e, item.id)}
                  onDrop={(e) => handleDrop(e, item.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleSelectLayer(item)}
                  className={`group relative flex items-center justify-between gap-1 px-1.5 py-1 rounded text-xs cursor-grab active:cursor-grabbing transition-all border select-none ${
                    isDragging
                      ? 'opacity-30 bg-[var(--accents-2)] border-dashed border-[var(--accents-4)]'
                      : isSelected
                      ? 'bg-orange-50 dark:bg-orange-950/30 border-[darkorange] text-[darkorange] font-medium'
                      : 'border-transparent hover:bg-[var(--accents-2)] text-[var(--accents-7)]'
                  } ${isHidden ? 'opacity-50' : ''}`}
                >
                  {/* Drop position indicator lines */}
                  {dropPosition === 'above' && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-[darkorange] pointer-events-none rounded-t" />
                  )}
                  {dropPosition === 'below' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[darkorange] pointer-events-none rounded-b" />
                  )}

                  {/* Drag Grip Handle */}
                  <div
                    className="text-[var(--accents-4)] group-hover:text-[var(--accents-6)] flex-shrink-0 cursor-grab active:cursor-grabbing px-0.5"
                    title="Drag to reorder"
                  >
                    <svg
                      width="8"
                      height="12"
                      viewBox="0 0 8 12"
                      fill="currentColor"
                      className="opacity-70 group-hover:opacity-100"
                    >
                      <circle cx="2" cy="2" r="1.2" />
                      <circle cx="6" cy="2" r="1.2" />
                      <circle cx="2" cy="6" r="1.2" />
                      <circle cx="6" cy="6" r="1.2" />
                      <circle cx="2" cy="10" r="1.2" />
                      <circle cx="6" cy="10" r="1.2" />
                    </svg>
                  </div>

                  {/* Left: Icon & Name */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-[var(--accents-5)] flex-shrink-0">
                      <LayerIcon type={item.type} />
                    </span>
                    <span className="truncate text-[11px]">
                      {getLayerLabel(item)}
                    </span>
                  </div>

                  {/* Right: Controls */}
                  <div
                    className="flex items-center gap-0.5 flex-shrink-0"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {/* Move Up (Forward) */}
                    <button
                      type="button"
                      draggable={false}
                      disabled={isAtTop}
                      onClick={(e) => moveLayer(item.id, 'up', e)}
                      title="Bring forward"
                      className={`p-0.5 rounded hover:bg-[var(--accents-3)]/30 ${
                        isAtTop
                          ? 'opacity-20 cursor-not-allowed'
                          : 'text-[var(--accents-6)]'
                      }`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                    </button>

                    {/* Move Down (Backward) */}
                    <button
                      type="button"
                      draggable={false}
                      disabled={isAtBottom}
                      onClick={(e) => moveLayer(item.id, 'down', e)}
                      title="Send backward"
                      className={`p-0.5 rounded hover:bg-[var(--accents-3)]/30 ${
                        isAtBottom
                          ? 'opacity-20 cursor-not-allowed'
                          : 'text-[var(--accents-6)]'
                      }`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>

                    {/* Visibility Toggle */}
                    <button
                      type="button"
                      draggable={false}
                      onClick={(e) => toggleVisibility(item.id, e)}
                      title={isHidden ? 'Show layer' : 'Hide layer'}
                      className={`p-0.5 rounded hover:bg-[var(--accents-3)]/30 ${
                        isHidden ? 'text-red-500' : 'text-[var(--accents-6)]'
                      }`}
                    >
                      {isHidden ? (
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>

                    {/* Delete item */}
                    <button
                      type="button"
                      draggable={false}
                      onClick={(e) => handleDelete(item.id, e)}
                      title="Delete layer"
                      className="p-0.5 rounded hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/40 text-[var(--accents-5)]"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function reorderVisualList(
  visualList: CanvasItem[],
  draggedId: string,
  targetId: string,
  dropPosition: 'above' | 'below'
): CanvasItem[] {
  if (draggedId === targetId) return visualList;
  const fromIndex = visualList.findIndex((i) => i.id === draggedId);
  if (fromIndex === -1) return visualList;

  const itemToMove = visualList[fromIndex];
  const listWithoutItem = visualList.filter((i) => i.id !== draggedId);

  const targetIndexInCleanList = listWithoutItem.findIndex(
    (i) => i.id === targetId
  );
  if (targetIndexInCleanList === -1) return visualList;

  const insertIndex =
    dropPosition === 'below'
      ? targetIndexInCleanList + 1
      : targetIndexInCleanList;

  const result = [...listWithoutItem];
  result.splice(insertIndex, 0, itemToMove);
  return result;
}

function getLayerLabel(item: CanvasItem): string {
  switch (item.type) {
    case 'text':
      return item.text
        ? `"${item.text.slice(0, 8)}${item.text.length > 8 ? '…' : ''}"`
        : 'Text';
    case 'rectangle':
      return 'Rectangle';
    case 'diamond':
      return 'Diamond';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return 'Line';
    case 'arrow':
      return 'Arrow';
    case 'pencil':
      return 'Drawing';
    case 'image':
      return 'Image';
    default:
      return 'Item';
  }
}

function LayerIcon({ type }: { type: CanvasItem['type'] }) {
  switch (type) {
    case 'rectangle':
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        </svg>
      );
    case 'diamond':
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 22 12 12 22 2 12"></polygon>
        </svg>
      );
    case 'ellipse':
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      );
    case 'pencil':
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
      );
    case 'line':
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="19" x2="19" y2="5"></line>
        </svg>
      );
    case 'arrow':
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      );
    case 'text':
      return (
        <span className="font-bold text-[10px] leading-none px-0.5 font-serif">
          T
        </span>
      );
    case 'image':
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      );
    default:
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      );
  }
}
