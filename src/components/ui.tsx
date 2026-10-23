import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewStyle,
} from 'react-native';

import { Radius, Spacing, useTheme } from '@/constants/theme';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const theme = useTheme();
  if (!scroll) {
    return <View style={[styles.screen, { backgroundColor: theme.background }]}>{children}</View>;
  }
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

type AppTextProps = TextProps & { variant?: 'title' | 'subtitle' | 'body' | 'secondary' };

export function AppText({ variant = 'body', style, ...props }: AppTextProps) {
  const theme = useTheme();
  return (
    <Text
      style={[
        styles[variant],
        { color: variant === 'secondary' ? theme.textSecondary : theme.text },
        style,
      ]}
      {...props}
    />
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const theme = useTheme();
  const background =
    variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : theme.backgroundElement;
  const color = variant === 'secondary' ? theme.text : theme.primaryText;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.buttonText, { color }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function TextField({ label, style, ...props }: TextInputProps & { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      {label ? <AppText variant="secondary">{label}</AppText> : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  const theme = useTheme();
  if (!message) {
    return null;
  }
  return <Text style={[styles.body, { color: theme.danger }]}>{message}</Text>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.empty}>
      <AppText variant="subtitle">{title}</AppText>
      {description ? <AppText variant="secondary">{description}</AppText> : null}
    </View>
  );
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
  },
  secondary: {
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    minHeight: 48,
    borderRadius: Radius,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five,
    gap: Spacing.two,
  },
});
