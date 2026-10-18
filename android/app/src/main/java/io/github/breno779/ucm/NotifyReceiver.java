package io.github.breno779.ucm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.Calendar;

public class NotifyReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        Notifier.show(c, "UCM Watchlist", Notifier.textFor(c, Calendar.getInstance()));
        Notifier.schedule(c);   // agenda o de amanhã
    }
}
