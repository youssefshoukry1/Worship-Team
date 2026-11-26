'use client';
import { Component, createRef } from 'react';

// Capture the visible card immediately before React reorders this list. Browsers
// that already preserved the anchor report a zero offset after the commit.
export default class PeopleRows extends Component {
  container = createRef();

  getSnapshotBeforeUpdate(previous) {
    if (!this.props.active || previous.items === this.props.items) return null;
    const list = this.container.current;
    const bounds = list.getBoundingClientRect();
    const top = Math.max(0, bounds.top);
    const bottom = Math.min(window.innerHeight, bounds.bottom);
    if (bounds.top >= 0 || bottom <= top || bounds.width === 0) return null;
    const element = document.elementFromPoint(bounds.left + bounds.width / 2, (top + bottom) / 2);
    const row = element?.closest('[data-people-row]');
    if (!row || row.parentElement !== list) return null;
    return { row, top: row.getBoundingClientRect().top };
  }

  componentDidUpdate(previous, state, anchor) {
    if (!anchor?.row.isConnected) return;
    const offset = anchor.row.getBoundingClientRect().top - anchor.top;
    if (Math.abs(offset) > 1) window.scrollBy({ top: offset, behavior: 'instant' });
  }

  render() {
    return <div ref={this.container} className="space-y-2">{this.props.children}</div>;
  }
}
