import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';

const validInput = JSON.stringify([
  { id: 'A', dx: 5, dy: 7, weight: 2 },
  { id: 'B', dx: -3, dy: -2, weight: 1 },
  { id: 'C', dx: -1, dy: -4, weight: 1 },
]);

describe('App 集成', () => {
  it('合法输入完成平差，合计行两轴严格为 0', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: validInput } });
    fireEvent.click(screen.getByRole('button', { name: '执行平差' }));

    // 3 行数据
    const rows = screen.getAllByRole('row').slice(1, -1); // 去表头与合计行
    expect(rows).toHaveLength(3);
    expect(screen.getByTestId('sum-adjusted-x').textContent).toBe('0');
    expect(screen.getByTestId('sum-adjusted-y').textContent).toBe('0');
    // 闭合差 fx=1, fy=1 展示
    expect(screen.getByText('已严格闭合')).toBeTruthy();
  });

  it('非法字段拒绝整份数据：报错且上次有效图形保留', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: validInput } });
    fireEvent.click(screen.getByRole('button', { name: '执行平差' }));
    expect(screen.getByTestId('sum-adjusted-x').textContent).toBe('0');

    const invalid = JSON.stringify([
      { id: 'A', dx: 5, dy: 7, weight: 2 },
      { id: 'A', dx: 0, dy: 0, weight: 1 }, // 重复 id
      { id: 'C', dx: -1, dy: -4, weight: 1 },
    ]);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: invalid } });
    fireEvent.click(screen.getByRole('button', { name: '执行平差' }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('重复');
    expect(alert.textContent).toContain('上次有效图形');
    // 上次有效图形的表格与合计仍在
    expect(screen.getByTestId('sum-adjusted-x').textContent).toBe('0');
    const dataRows = document.querySelectorAll('tbody tr');
    expect(dataRows.length).toBe(3);
  });

  it('示例按钮可直接载入并平差', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '载入示例' }));
    expect(screen.getByTestId('sum-adjusted-x').textContent).toBe('0');
    expect(screen.getByTestId('sum-adjusted-y').textContent).toBe('0');
    // 示例 4 条边，权重和 6
    expect(screen.getByTestId('edge-count').textContent).toBe('4');
    expect(document.querySelectorAll('tbody tr').length).toBe(4);
  });

  it('无有效结果时导出按钮禁用', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: '下载 JSON' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '下载 PNG' }).hasAttribute('disabled')).toBe(true);
  });
});
