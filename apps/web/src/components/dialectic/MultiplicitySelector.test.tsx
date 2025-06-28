import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MultiplicitySelector } from './MultiplicitySelector';

describe('MultiplicitySelector', () => {
  it('renders with initial value', () => {
    render(<MultiplicitySelector value={5} onChange={vi.fn()} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('calls onChange with decremented value when minus button is clicked', async () => {
    const handleChange = vi.fn();
    render(<MultiplicitySelector value={5} onChange={handleChange} />);
    await userEvent.click(screen.getByRole('button', { name: /decrement multiplicity/i }));
    expect(handleChange).toHaveBeenCalledWith(4);
  });

  it('calls onChange with incremented value when plus button is clicked', async () => {
    const handleChange = vi.fn();
    render(<MultiplicitySelector value={5} onChange={handleChange} />);
    await userEvent.click(screen.getByRole('button', { name: /increment multiplicity/i }));
    expect(handleChange).toHaveBeenCalledWith(6);
  });

  it('does not decrement below minValue', async () => {
    const handleChange = vi.fn();
    render(<MultiplicitySelector value={0} onChange={handleChange} minValue={0} />);
    const decrementButton = screen.getByRole('button', { name: /decrement multiplicity/i });
    expect(decrementButton).toBeDisabled();
    await userEvent.click(decrementButton);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('does not increment above maxValue', async () => {
    const handleChange = vi.fn();
    render(<MultiplicitySelector value={10} onChange={handleChange} maxValue={10} />);
    const incrementButton = screen.getByRole('button', { name: /increment multiplicity/i });
    expect(incrementButton).toBeDisabled();
    await userEvent.click(incrementButton);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('disables buttons when value is at minValue (default 0)', () => {
    render(<MultiplicitySelector value={0} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /decrement multiplicity/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /increment multiplicity/i })).not.toBeDisabled();
  });

  it('disables buttons when value is at custom minValue', () => {
    render(<MultiplicitySelector value={1} onChange={vi.fn()} minValue={1} />);
    expect(screen.getByRole('button', { name: /decrement multiplicity/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /increment multiplicity/i })).not.toBeDisabled();
  });
  
  it('disables increment button when value is at maxValue', () => {
    render(<MultiplicitySelector value={5} onChange={vi.fn()} maxValue={5} />);
    expect(screen.getByRole('button', { name: /decrement multiplicity/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /increment multiplicity/i })).toBeDisabled();
  });

  it('all controls are disabled when disabled prop is true', () => {
    render(<MultiplicitySelector value={5} onChange={vi.fn()} disabled={true} />);
    expect(screen.getByRole('button', { name: /decrement multiplicity/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /increment multiplicity/i })).toBeDisabled();
  });

  it('handles increment correctly when no maxValue is provided', async () => {
    const handleChange = vi.fn();
    const { rerender } = render(<MultiplicitySelector value={5} onChange={handleChange} />);
    const incrementButton = screen.getByRole('button', { name: /increment multiplicity/i });

    await userEvent.click(incrementButton);
    expect(handleChange).toHaveBeenCalledWith(6);

    rerender(<MultiplicitySelector value={6} onChange={handleChange} />);

    await userEvent.click(incrementButton);
    expect(handleChange).toHaveBeenCalledWith(7);
  });

  it('handles decrement correctly to minValue', async () => {
    const handleChange = vi.fn();
    render(<MultiplicitySelector value={1} onChange={handleChange} minValue={0} />);
    await userEvent.click(screen.getByRole('button', { name: /decrement multiplicity/i }));
    expect(handleChange).toHaveBeenCalledWith(0);
  });
  
  it('has correct aria-labels for buttons', () => {
    render(<MultiplicitySelector value={5} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /decrement multiplicity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /increment multiplicity/i })).toBeInTheDocument();
  });

  it('displays the value correctly via aria-live for accessibility', () => {
    render(<MultiplicitySelector value={3} onChange={vi.fn()} />);
    const valueDisplay = screen.getByText('3');
    expect(valueDisplay).toHaveAttribute('aria-live', 'polite');
  });

  it('updates displayed value when prop changes', () => {
    const { rerender } = render(<MultiplicitySelector value={5} onChange={vi.fn()} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    rerender(<MultiplicitySelector value={10} onChange={vi.fn()} />);
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('does not call onChange if disabled and increment is clicked', async () => {
    const handleChange = vi.fn();
    render(<MultiplicitySelector value={5} onChange={handleChange} disabled={true} />);
    await userEvent.click(screen.getByRole('button', { name: /increment multiplicity/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('does not call onChange if disabled and decrement is clicked', async () => {
    const handleChange = vi.fn();
    render(<MultiplicitySelector value={5} onChange={handleChange} disabled={true} />);
    await userEvent.click(screen.getByRole('button', { name: /decrement multiplicity/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });
}); 