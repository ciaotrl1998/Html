#include <jni.h>
#include <node.h>
#include <android/log.h>
#include <unistd.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <thread>
#include <vector>
#include <utility>

static void redirect_log(int descriptor, int priority) {
    int pipes[2];
    if (pipe(pipes) != 0) return;
    if (dup2(pipes[1], descriptor) < 0) { close(pipes[0]); close(pipes[1]); return; }
    close(pipes[1]);
    std::thread([fd = pipes[0], priority]() {
        char buffer[2048];
        ssize_t size;
        while ((size = read(fd, buffer, sizeof(buffer) - 1)) > 0) {
            buffer[size] = '\0';
            __android_log_write(priority, "HtmlBoxServer", buffer);
        }
        close(fd);
    }).detach();
}

extern "C" JNIEXPORT jint JNICALL
Java_cn_linecode_game2048_NodeRuntime_startNative(JNIEnv *env, jclass, jobjectArray arguments, jbyteArray configuration, jbyteArray directory) {
    std::string config(env->GetArrayLength(configuration), '\0');
    env->GetByteArrayRegion(configuration, 0, config.size(), reinterpret_cast<jbyte *>(config.data()));
    setenv("HTMLBOX_CONFIG", config.c_str(), 1);
    std::string cwd(env->GetArrayLength(directory), '\0');
    env->GetByteArrayRegion(directory, 0, cwd.size(), reinterpret_cast<jbyte *>(cwd.data()));
    if (chdir(cwd.c_str()) != 0) return -2;
    const jsize count = env->GetArrayLength(arguments);
    std::vector<std::string> strings;
    size_t length = 0;
    for (jsize i = 0; i < count; ++i) {
        auto argument = static_cast<jbyteArray>(env->GetObjectArrayElement(arguments, i));
        std::string text(env->GetArrayLength(argument), '\0');
        env->GetByteArrayRegion(argument, 0, text.size(), reinterpret_cast<jbyte *>(text.data()));
        strings.push_back(std::move(text));
        length += strings.back().size() + 1;
        env->DeleteLocalRef(argument);
    }
    // libuv requires argv strings to live in one contiguous writable allocation.
    std::vector<char> buffer(length);
    std::vector<char *> argv(count + 1, nullptr);
    char *cursor = buffer.data();
    for (jsize i = 0; i < count; ++i) {
        argv[i] = cursor;
        std::memcpy(cursor, strings[i].c_str(), strings[i].size() + 1);
        cursor += strings[i].size() + 1;
    }
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    redirect_log(STDOUT_FILENO, ANDROID_LOG_INFO);
    redirect_log(STDERR_FILENO, ANDROID_LOG_ERROR);
    return node::Start(count, argv.data());
}
