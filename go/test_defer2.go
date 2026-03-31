package main
import (
	"fmt"
	"os"
)
func main() {
	doExit()
}
func doExit() {
	defer fmt.Println("deferred")
	os.Exit(0)
}
