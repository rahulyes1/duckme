/** Says plainly what a reminder can do, and offers to switch alerts on. */
import { useState } from 'react';
import { askPermission, notifyState } from '../../lib/notify';

export function ReminderNote() {
  const [state, setState] = useState(notifyState);
  return (
    <p className="qt-help">
      {state === 'granted' ? 'Alerts can be late or missed when Hisaab is closed.'
        : state === 'default' ? <>Phone alerts are off. <button type="button" className="btn ghost" onClick={() => void askPermission().then(setState)}>Turn on alerts</button></>
          : 'Phone alerts are not available here, so check Hisaab for this one.'}
    </p>
  );
}
