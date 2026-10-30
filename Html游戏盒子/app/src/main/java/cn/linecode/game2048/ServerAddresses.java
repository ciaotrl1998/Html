package cn.linecode.game2048;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.LinkAddress;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class ServerAddresses {
    private ServerAddresses() {}
    static List<String> lan(Context context) {
        LinkedHashSet<String> addresses = new LinkedHashSet<>();
        try {
            ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager != null) for (Network network : manager.getAllNetworks()) {
                NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
                if (capabilities == null || (!capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                        && !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))) continue;
                LinkProperties properties = manager.getLinkProperties(network);
                if (properties != null) for (LinkAddress link : properties.getLinkAddresses()) add(addresses, link.getAddress());
            }
        } catch (Exception ignored) {}
        // Hotspot adapters may not appear as an active ConnectivityManager network.
        try {
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback()) continue;
                String name = network.getName();
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("pdp")
                        || name.startsWith("wwan") || name.startsWith("tun")) continue;
                for (InetAddress address : Collections.list(network.getInetAddresses())) add(addresses, address);
            }
        } catch (Exception ignored) {}
        try {
            WifiManager wifi = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            int ip = wifi == null || wifi.getConnectionInfo() == null ? 0 : wifi.getConnectionInfo().getIpAddress();
            if (ip != 0) add(addresses, InetAddress.getByAddress(new byte[]{(byte) ip, (byte) (ip >> 8), (byte) (ip >> 16), (byte) (ip >> 24)}));
        } catch (Exception ignored) {}
        return new ArrayList<>(addresses);
    }
    private static void add(LinkedHashSet<String> addresses, InetAddress address) {
        if (address instanceof Inet4Address && address.isSiteLocalAddress() && !address.isLoopbackAddress()) addresses.add(address.getHostAddress());
    }
    static JSONObject interfaces(Context context) throws Exception {
        JSONObject result = new JSONObject();
        result.put("lo", new JSONArray().put(address("127.0.0.1", true)));
        int index = 0;
        for (String ip : lan(context)) result.put("lan" + index++, new JSONArray().put(address(ip, false)));
        return result;
    }
    private static JSONObject address(String ip, boolean internal) throws Exception {
        return new JSONObject().put("address", ip).put("family", "IPv4").put("internal", internal);
    }
}
