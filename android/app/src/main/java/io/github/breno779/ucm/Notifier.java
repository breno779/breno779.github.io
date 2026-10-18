package io.github.breno779.ucm;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** Notificação diária do app (horário escolhido no app; o texto de cada dia vem do JS). */
public class Notifier {
    static final String PREFS = "ucm-notif";
    static final String CHANNEL = "diario";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static void save(Context c, boolean on, String time, String textsJson) {
        prefs(c).edit().putBoolean("on", on).putString("time", time).putString("texts", textsJson).apply();
        schedule(c);
    }

    static PendingIntent pending(Context c) {
        Intent i = new Intent(c, NotifyReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(c, 1, i, flags);
    }

    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.cancel(pending(c));
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("on", false)) return;
        String[] hm = p.getString("time", "19:00").split(":");
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0]));
        cal.set(Calendar.MINUTE, hm.length > 1 ? Integer.parseInt(hm[1]) : 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis() + 5000) cal.add(Calendar.DAY_OF_MONTH, 1);
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pending(c));
        else am.set(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pending(c));
    }

    static String textFor(Context c, Calendar day) {
        String key = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(day.getTime());
        try {
            JSONObject o = new JSONObject(prefs(c).getString("texts", "{}"));
            if (o.has(key)) return o.getString(key);
        } catch (Exception ignored) { }
        return "🎬 Hora da Marvel! Abra o app pra ver o que tem hoje.";
    }

    static void show(Context c, String title, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Lembrete diário", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(c, 2, open, flags);
        android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new android.app.Notification.Builder(c, CHANNEL) : new android.app.Notification.Builder(c);
        b.setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(text)
            .setStyle(new android.app.Notification.BigTextStyle().bigText(text))
            .setContentIntent(pi).setAutoCancel(true);
        nm.notify(7, b.build());
    }
}
