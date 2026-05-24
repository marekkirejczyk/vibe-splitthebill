import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

test("test harness renders a basic RN tree", () => {
  render(
    <View>
      <Text>ok</Text>
    </View>,
  );
  expect(screen.getByText("ok")).toBeTruthy();
});
