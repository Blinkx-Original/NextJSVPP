import { useMemo } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';

type IdType = string | number;

export interface TreeItem<T> {
  id: IdType;
  data: T;
  children?: TreeItem<T>[];
}

export interface NodeState<T> {
  id: IdType;
  data: T;
  level: number;
  isLeaf: boolean;
  isInternal: boolean;
  isSelected: boolean;
}

export interface NodeRendererProps<T> {
  node: NodeState<T>;
  style: CSSProperties;
  dragHandle: {
    onMouseDown: (event: MouseEvent) => void;
  };
}

export interface TreeProps<T> {
  data: Array<TreeItem<T>>;
  renderNode: (props: NodeRendererProps<T>) => ReactNode;
  selection?: IdType[];
  onSelect?: (ids: IdType[]) => void;
  openByDefault?: boolean;
}

interface InternalNode<T> extends NodeState<T> {
  children?: InternalNode<T>[];
}

function buildInternalNodes<T>(
  items: Array<TreeItem<T>>,
  selectionSet: Set<IdType>,
  level: number
): InternalNode<T>[] {
  return items.map((item) => {
    const children = item.children ? buildInternalNodes(item.children, selectionSet, level + 1) : undefined;
    return {
      id: item.id,
      data: item.data,
      level,
      isLeaf: !children || children.length === 0,
      isInternal: Boolean(children && children.length > 0),
      isSelected: selectionSet.has(item.id),
      children
    };
  });
}

function NodeList<T>({
  nodes,
  renderNode,
  onSelect,
  selection
}: {
  nodes: InternalNode<T>[];
  renderNode: (props: NodeRendererProps<T>) => ReactNode;
  onSelect?: (ids: IdType[]) => void;
  selection: Set<IdType>;
}): JSX.Element {
  return (
    <>
      {nodes.map((node) => {
        const style: CSSProperties = {
          paddingLeft: node.level * 16,
          cursor: 'pointer'
        };
        const handleSelect = () => {
          onSelect?.([node.id]);
        };
        return (
          <div key={node.id} role="treeitem" aria-selected={node.isSelected} onClick={handleSelect}>
            {renderNode({
              node,
              style,
              dragHandle: {
                onMouseDown: () => {
                  /* no-op */
                }
              }
            })}
            {node.children && node.children.length > 0 ? (
              <NodeList nodes={node.children} renderNode={renderNode} onSelect={onSelect} selection={selection} />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function Tree<T>({ data, renderNode, selection = [], onSelect }: TreeProps<T>): JSX.Element {
  const selectionSet = useMemo(() => new Set<IdType>(selection), [selection]);
  const nodes = useMemo(() => buildInternalNodes(data, selectionSet, 0), [data, selectionSet]);

  return (
    <div role="tree">
      <NodeList nodes={nodes} renderNode={renderNode} onSelect={onSelect} selection={selectionSet} />
    </div>
  );
}

export type NodeRenderer<T> = (props: NodeRendererProps<T>) => ReactNode;
