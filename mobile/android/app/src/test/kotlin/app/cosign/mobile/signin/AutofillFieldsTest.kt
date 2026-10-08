package app.cosign.mobile.signin

import app.cosign.mobile.signin.AutofillFields.Node
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AutofillFieldsTest {
    private val textPassword = 0x81 // TYPE_CLASS_TEXT | TYPE_TEXT_VARIATION_PASSWORD
    private val numberPassword = 0x12 // TYPE_CLASS_NUMBER | TYPE_NUMBER_VARIATION_PASSWORD
    private val plainText = 0x1
    private val email = 0x21

    @Test
    fun aNativeAppWithAutofillHints() {
        val f = AutofillFields.pick(listOf(Node("search", inputType = plainText, idEntry = "search_box"), Node("user", hints = listOf("username")), Node("pass", hints = listOf("password"))))!!
        assertEquals("user", f.username)
        assertEquals("pass", f.password)
    }

    @Test
    fun aBankAppWithoutHintsUsesInputTypesAndIds() {
        val f = AutofillFields.pick(listOf(Node("u", inputType = plainText, idEntry = "et_customer_id"), Node("p", inputType = numberPassword, idEntry = "et_mpin")))!!
        assertEquals("u", f.username)
        assertEquals("p", f.password)
    }

    @Test
    fun aWebPageWithHtmlAttributes() {
        val f = AutofillFields.pick(
            listOf(
                Node("q", htmlType = "search"),
                Node("e", htmlType = "email", htmlAutocomplete = "username"),
                Node("pw", htmlType = "password", htmlAutocomplete = "current-password"),
            ),
        )!!
        assertEquals("e", f.username)
        assertEquals("pw", f.password)
    }

    @Test
    fun aPlainTextBoxBeforeThePasswordIsTakenAsTheUsername() {
        val f = AutofillFields.pick(listOf(Node("a", inputType = plainText), Node("b", inputType = textPassword)))!!
        assertEquals("a", f.username)
        assertEquals("b", f.password)
    }

    @Test
    fun aScreenWithoutAPasswordIsIgnored() {
        assertNull(AutofillFields.pick(listOf(Node("a", inputType = email), Node("b", inputType = plainText, idEntry = "pincode_area"))))
    }

    @Test
    fun wordsInsideOtherWordsDoNotCount() {
        // "spinner" and "pincode" contain "pin" but are not PIN boxes.
        assertEquals(false, AutofillFields.isPassword(Node("x", idEntry = "spinner_city")))
        assertEquals(false, AutofillFields.isPassword(Node("x", idEntry = "pincode")))
        assertEquals(true, AutofillFields.isPassword(Node("x", idEntry = "login_pin")))
    }
}
