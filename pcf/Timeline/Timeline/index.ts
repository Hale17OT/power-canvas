import { IInputs, IOutputs } from './generated/ManifestTypes';
import { parseTimeline } from '../../../src/timeline/model';
export class Timeline implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private root!: HTMLDivElement;
    private notify!: () => void;
    private selectedId = '';
    private lastInput = '';
    public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void, _state: ComponentFramework.Dictionary, container: HTMLDivElement): void {
        this.root = container; this.root.classList.add('powercanvas-timeline'); this.notify = notifyOutputChanged;
        context.mode.trackContainerResize(true);
    }
    public updateView(context: ComponentFramework.Context<IInputs>): void {
        const json = context.parameters.eventsJson.raw ?? '[]';
        const signature = JSON.stringify([json, context.parameters.theme.raw, context.mode.isControlDisabled]);
        if (signature === this.lastInput) return;
        this.lastInput = signature;
        const focused = this.root.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.eventId : undefined;
        this.root.dataset.theme = context.parameters.theme.raw === 'dark' ? 'dark' : 'light';
        this.root.replaceChildren();
        const heading = document.createElement('h2'); heading.textContent = 'Activity timeline'; this.root.append(heading);
        try {
            const events = parseTimeline(json);
            if (!events.length) { const empty = document.createElement('p'); empty.textContent = 'No activity yet.'; this.root.append(empty); return; }
            const list = document.createElement('ol'); list.setAttribute('aria-label', 'Activity timeline');
            for (const event of events) {
                const row = document.createElement('li'); row.dataset.kind = event.kind;
                const button = document.createElement('button'); button.type = 'button'; button.dataset.eventId = event.id; button.textContent = event.title;
                button.setAttribute('aria-pressed', String(this.selectedId === event.id)); button.disabled = context.mode.isControlDisabled;
                button.addEventListener('click', () => { this.selectedId = event.id; this.root.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); this.notify(); });
                const meta = document.createElement('p'); const time = document.createElement('time'); time.dateTime = event.timestamp; time.textContent = new Date(event.timestamp).toISOString().replace('T', ' ').replace('.000Z', ' UTC'); meta.append(time, ` · ${event.actor} · ${event.kind}`);
                const description = document.createElement('p'); description.textContent = event.description;
                row.append(button, meta, description);
                if (event.before !== undefined || event.after !== undefined) { const change = document.createElement('p'); change.textContent = `Before: ${event.before ?? '—'} → After: ${event.after ?? '—'}`; row.append(change); }
                list.append(row);
            }
            this.root.append(list);
            if (focused) this.root.querySelectorAll<HTMLButtonElement>('button').forEach(b => { if (b.dataset.eventId === focused) b.focus(); });
        } catch {
            const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = 'Activity cannot be displayed. Check the timeline data format.'; this.root.append(error);
        }
    }
    public getOutputs(): IOutputs { return { selectedEventId: this.selectedId }; }
    public destroy(): void { this.root.replaceChildren(); this.lastInput = ''; }
}
